import _ from 'lodash';
import * as d3 from 'd3';
import * as graphviz from 'd3-graphviz';
import axios from 'axios';
import {locale, navigation, navbar, spinner} from '@gros/visualization-ui';
import config from 'config.json';
import spec from './locales.json';

const locales = new locale(spec);
const searchParams = new URLSearchParams(window.location.search);
locales.select(searchParams.get("lang"));

const makeLegend = (states) => {
    const legend = d3.select('#legend');
    legend.selectAll('span.tag')
        .data(states)
        .enter()
        .append('span')
        .classed('tag is-light', true)
        .style('border-color', d => d[0])
        .text(d => locales.attribute('states', d[1]));
};

const linspace = (start, stop, nsteps) => {
    const delta = (stop - start) / (nsteps - 1);
    return d3.range(start, stop + delta, delta).slice(0, nsteps);
};

const makePalette = (palette) => {
    const width = 250,
          height = 10;
    const legendSvg = d3.select('#palette')
        .append('svg')
        .attr('width', width)
        .attr('height', height*3)
        .append('g');

    // append gradient bar
    const gradient = legendSvg.append('defs')
        .append('linearGradient')
        .attr('id', 'gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%')
        .attr('spreadMethod', 'pad');

    // programatically generate the gradient for the legend
    // this creates an array of [pct, colour] pairs as stop
    // values for legend
    var pct = linspace(0, 100, palette.length).map(function(d) {
        return Math.round(d) + '%';
    });

    var colourPct = d3.zip(pct, palette);
    colourPct.forEach(function(d) {
        gradient.append('stop')
            .attr('offset', d[0])
            .attr('stop-color', d[1])
            .attr('stop-opacity', 1);
    });

    legendSvg.append('rect')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('width', width)
        .attr('height', height)
        .style('fill', 'url(#gradient)');
    legendSvg.append('text')
        .attr('dx', 0)
        .attr('dy', height*2)
        .text(locales.message("temperature-low"));
    legendSvg.append('text')
        .attr('dx', width)
        .attr('dy', height*2)
        .attr('text-anchor', 'end')
        .text(locales.message("temperature-high"));
};

const buildProjectFilter = function(projectsNavigation, projectData) {
    const filter = (projectData) => {
        const filters = {};
        d3.selectAll('#filter input').each(function(d) {
            const checked = d3.select(this).property('checked');
            const bits = d.inverse ? [d.inverse, !checked] : [d.key, checked];
            if (bits[1]) {
                filters[bits[0]] = true;
            }
        });

        return _.filter(projectData, filters);
    };

    const label = d3.select('#filter')
        .selectAll('label')
        .data([
            {key: 'recent', default: true},
            {key: 'support', inverse: 'core', default: false}
        ])
        .enter()
        .append('label')
        .classed('checkbox', true);
    label.append('input')
        .attr('type', 'checkbox')
        .property('checked', d => d.default)
        .on('change', () => {
            projectsNavigation.update(filter(projectData));
        });
    label.append('span')
        .text(d => locales.attribute("project-filter", d.key))
        .attr('title', d => locales.attribute("project-filter-title", d.key));

    return filter(projectData);
};

d3.select(document).on('DOMContentLoaded', () => {
    const loadingSpinner = new spinner({
        width: d3.select('#container').node().clientWidth,
        height: d3.select('#flow').node().clientHeight,
        startAngle: 220,
        container: '#container',
        id: 'loading-spinner'
    });
    loadingSpinner.start();

    axios.all([
        axios.get('data/projects_meta.json'),
        axios.get('data/story_flow_palette.json'),
        axios.get('data/story_flow_states.json')
    ]).then(axios.spread(function(projectData, paletteData, stateData) {
        makeLegend(_.toPairs(stateData.data));
        makePalette(paletteData.data);

        const vizScript = d3.selectAll('script').filter(function() {
            return d3.select(this).attr('type') === 'javascript/worker';
        });

        const url = document.location.protocol + '//' + document.location.host +
            document.location.pathname.substr(0, document.location.pathname.lastIndexOf('/')+1);

        vizScript.attr('src', url + vizScript.attr('src'));

        let minStories = 5;
        let maxStories = 0;

        function setupGraphviz() {
            return d3.select('#flow').graphviz()
                .transition(function () {
                    return d3.transition("main")
                        .ease(d3.easeLinear)
                        .duration(750);
                });
        }
        let graphviz = setupGraphviz();
        let dotSrc = null;

        function filter(dotSrc) {
            let nodes = new Set();
            const edgeRegex = /^("[^"]+") -> ("[^"]+") \[label="[^"]+\D(\d+) stories"/;
            const nodeRegex = /^("[^"]+") \[style=/;
            const rankRegex = /^\{rank = \w+;/;
            return _.map(_.filter(dotSrc.split('\n'), line => {
                const edgeMatch = line.match(edgeRegex);
                if (edgeMatch !== null) {
                    maxStories = Math.max(edgeMatch[3], maxStories);
                    if (edgeMatch[3] < minStories) {
                        return false;
                    }
                    nodes.add(edgeMatch[1]);
                    nodes.add(edgeMatch[2]);
                    return true;
                }

                const nodeMatch = line.match(nodeRegex);
                if (nodeMatch !== null) {
                    return nodes.has(nodeMatch[1]);
                }

                return true;
            }), line => {
                if (rankRegex.test(line)) {
                    const parts = line.substr(1, line.length - 2).split(';');
                    const rank = parts.shift();
                    return _.concat("{", rank, ";",
                        _.filter(parts, part => nodes.has(part.trim())).join(';'),
                        "}"
                    ).join('');
                }
                return line;
            }).join('\n');
        }

        function setCurrentProject(project, hasProject) {
            if (hasProject) {
                loadingSpinner.start();
                axios.get(`data/story_flow-${project}.dot`)
                    .then(response => {
                        try {
                            maxStories = 0;
                            dotSrc = response.data;
                            graphviz = setupGraphviz();
                            graphviz.renderDot(filter(dotSrc), () => {
                                loadingSpinner.stop();

                                d3.select('#slider input')
                                    .property('value', minStories)
                                    .attr('max', Math.round(maxStories/10));
                                d3.select('#slider output').text(minStories);
                            });
                        }
                        catch (error) {
                        }
                    });
            }
            return hasProject;
        }

        d3.select('#slider input')
            .on('input', function() {
                d3.select('#slider output').text(this.value);
            })
            .on('change', function() {
                minStories = Number(this.value);
                try {
                    loadingSpinner.start();
                    graphviz.renderDot(filter(dotSrc), () => {
                        loadingSpinner.stop();
                    });
                }
                catch (error) {
                }
            });

        const projectsNavigation = new navigation({
            setCurrentItem: setCurrentProject,
            key: d => d.name,
            addElement: (element) => {
                element.style("width", "0%")
                    .style("opacity", "0")
                    .text(d => d.name)
                    .attr('title', d => locales.message("project-title",
                        [d.quality_display_name || d.name]
                    ))
                    .transition()
                    .style("width", "100%")
                    .style("opacity", "1");
            },
            removeElement: (element) => {
                element.transition()
                    .style("opacity", "0")
                    .remove();
            }
        });

        const filteredData = buildProjectFilter(projectsNavigation,
            projectData.data
        );

        projectsNavigation.start(filteredData);

        loadingSpinner.stop();
    }))
    .catch(function (error) {
        loadingSpinner.stop();
        d3.select('#error-message')
            .classed('is-hidden', false)
            .text(locales.message('data-error', [error]));
        throw error;
    });

    locales.updateMessages(d3.select('body'), [], null);

    window.buildNavigation(navbar, locales, config);
});
