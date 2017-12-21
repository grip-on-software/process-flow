import * as d3 from 'd3';
import * as graphviz from 'd3-graphviz';
import axios from 'axios';
import {navigation, spinner} from '@gros/visualization-ui';
import naturalSort from 'javascript-natural-sort';

const loadingSpinner = new spinner({
    width: d3.select('#container').node().clientWidth,
    height: 100,
    startAngle: 220,
    container: '#container',
    id: 'loading-spinner'
});
loadingSpinner.start();

axios.get('data/report_projects.json')
.then(function(response) {
    // Array of all project names, sorted alphabetically
    const projects = response.data.map(String).sort(naturalSort);

    const vizScript = d3.selectAll('script').filter(function() {
        return d3.select(this).attr('type') == 'javascript/worker';
    });
    vizScript.attr('src', document.location.protocol + '//' + document.location.host + document.location.pathname + vizScript.attr('src'));

    function setupGraphviz() {
        return d3.select('#flow').graphviz()
            .transition(function () {
                return d3.transition("main")
                    .ease(d3.easeLinear)
                    .duration(1000);
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
                        graphviz.renderDot(dotSrc, () => {
                            loadingSpinner.stop();
                            dotSrc = null;
                        });
                    }
                    catch (error) {
                    }
                });
        }
    }
    window.onerror = () => {
        if (dotSrc !== null) {
            console.log('Retrying to render');
            d3.select('#flow').select('svg').remove();
            graphviz = setupGraphviz();
            graphviz.renderDot(dotSrc, () => {
                loadingSpinner.stop();
            });
            dotSrc = null;
        }
    };

    const projectsNavigation = new navigation({
        setCurrentProject: setCurrentProject
    });
    
    projectsNavigation.start(projects);

    loadingSpinner.stop();
})
.catch(function (error) {
    console.log(error);
    loadingSpinner.stop();
    d3.select('#error-message')
        .classed('is-hidden', false)
        .text('Could not load data: ' + error);
});
