import _ from 'lodash';
import * as d3 from 'd3';
import * as graphviz from 'd3-graphviz';
import axios from 'axios';
import {locale, navigation, navbar, spinner} from '@gros/visualization-ui';
import naturalSort from 'javascript-natural-sort';
import config from 'config.json';
import spec from './locales.json';

const locales = new locale(spec);
const searchParams = new URLSearchParams(window.location.search);
locales.select(searchParams.get("lang"));

const makeLegend = (states) => {
    const width = 20;
    const height = 20;
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
        axios.get('data/report_project_names.json'),
        axios.get('data/story_flow_palette.json'),
        axios.get('data/story_flow_states.json')
    ]).then(axios.spread(function(projectData, paletteData, stateData) {
        // Array of all project names, sorted alphabetically
        const projects = projectData.data.map(String).sort(naturalSort);

        makeLegend(_.toPairs(stateData.data));
        makePalette(paletteData.data);

        const vizScript = d3.selectAll('script').filter(function() {
            return d3.select(this).attr('type') === 'javascript/worker';
        });

        const url = document.location.protocol + '//' + document.location.host +
            document.location.pathname.substr(0, document.location.pathname.lastIndexOf('/')+1);

        vizScript.attr('src', url + vizScript.attr('src'));

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
        function setCurrentProject(project, hasProject) {
            if (hasProject) {
                loadingSpinner.start();
                axios.get(`data/story_flow-${project}.dot`)
                    .then(response => {
                        try {
                            dotSrc = response.data;
                            d3.select('#flow svg').remove();
                            graphviz = setupGraphviz();
                            graphviz.renderDot(dotSrc, () => {
                                loadingSpinner.stop();
                                dotSrc = null;
                            });
                        }
                        catch (error) {
                        }
                    });
            }
            return hasProject;
        }

        const projectsNavigation = new navigation({
            setCurrentItem: setCurrentProject
        });

        projectsNavigation.start(projects);

        loadingSpinner.stop();
    }))
    .catch(function (error) {
        loadingSpinner.stop();
        d3.select('#error-message')
            .classed('is-hidden', false)
            .text(locales.message('data-error', [error]));
        throw error;
    });

    locales.updateMessages();

    window.buildNavigation(navbar, locales, config);
});
