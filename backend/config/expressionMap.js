/**
 * Maps high-level emotions to character expression descriptions
 * that will be injected into the visual prompt.
 */
const expressionMap = {
    neutral: {
        description: 'neutral, calm presenter maintaining eye contact with the viewer'
    },
    friendly: {
        description: 'warm, friendly presenter with a slight smile, welcoming the viewer'
    },
    confident: {
        description: 'confident presenter explaining something clearly to the audience'
    },
    thinking: {
        description: 'thoughtful presenter, slightly tilted head, considering the idea while explaining'
    },
    surprised: {
        description: 'surprised presenter reacting to an unexpected insight while still explaining'
    },
    serious: {
        description: 'serious, focused presenter emphasizing an important or critical point'
    },
    explaining: {
        description: 'confident presenter actively explaining the concept with clear gestures'
    }
};

module.exports = expressionMap;

