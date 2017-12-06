import _ from 'lodash';
import * as d3 from 'd3';
import * as graphviz from 'd3-graphviz';
import axios from 'axios';
import spinner from './spinner';
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
    const projects = response.data.sort(naturalSort);
    let currentProject = null;
    let graphviz = d3.select('#flow').graphviz()
        .transition(function () {
            return d3.transition("main")
                .ease(d3.easeLinear)
                .duration(1000);
        });
    function setCurrentProject(project) {
        currentProject = project;
        d3.selectAll('#navigation ul li')
            .classed('is-active', d => d === project);

        axios.get(`data/story_flow-${project}.dot`)
            .then(response => {
                graphviz.renderDot(response.data);
            });
    }
    setCurrentProject(projects[0]);

    // Create project navigation
    d3.select('#navigation ul')
        .selectAll('li')
        .data(projects)
        .enter()
        .append('li')
        .classed('is-active', d => d === currentProject)
        .append('a')
        .text(d => d)
        .on('click', (project) => {
            setCurrentProject(project);
        });

    loadingSpinner.stop();
})
.catch(function (error) {
    console.log(error);
    loadingSpinner.stop();
    d3.select('#error-message')
        .classed('is-hidden', false)
        .text('Could not load data: ' + error);
});
