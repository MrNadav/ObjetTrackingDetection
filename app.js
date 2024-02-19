let video;
let model;
let previousFrameData = null;
let canvas, context;
const movementThreshold = 55; // Sensitivity for movement detection
let trackedObject = { tracking: false, class: '', bbox: [] };


let ws = new WebSocket('ws://your-server-address');
ws.onopen = function() {
    console.log('WebSocket connection established');
};
ws.onerror = function(error) {
    console.error('WebSocket Error:', error);
};


window.onload = async function() {
    video = document.getElementById('webcam');
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');

    // Access the webcam
    try {
        video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
        video.onloadedmetadata = () => {
            video.play();
            // Load the COCO-SSD model after ensuring the webcam is ready
            loadModel();
        };
    } catch (error) {
        console.error("Error accessing the webcam", error);
    }
};

async function loadModel() {
    // Load the COCO-SSD model
    model = await cocoSsd.load();
    // Start the frame processing loop
    requestAnimationFrame(processFrame);
}

async function processFrame() {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrameData = context.getImageData(0, 0, canvas.width, canvas.height);

    let movementChanges = [];
    if (previousFrameData) {
        movementChanges = detectMovement(currentFrameData.data, previousFrameData.data);
    }
    
    // Always run detection to find objects, but focus on the tracked object if already tracking
    const predictions = await model.detect(canvas);
    
    // If already tracking an object, try to find it in the current frame
    if (trackedObject.tracking) {
        const currentTracked = predictions.find(p => p.class === trackedObject.class &&
            overlap(p.bbox, trackedObject.bbox));
        if (currentTracked) {
            // Update the tracked object's bounding box
            trackedObject.bbox = currentTracked.bbox;
            highlightPredictions([currentTracked]); // Highlight only the tracked object
        } else {
            // If the tracked object can't be found, stop tracking
            trackedObject.tracking = false;
        }
    } else if (movementChanges.length > 0 && predictions.length > 0) {
        // If not currently tracking and movement is detected, start tracking the largest object
        trackedObject = selectObjectToTrack(predictions);
        trackedObject.tracking = true;
        highlightPredictions([trackedObject]);
    }

    previousFrameData = currentFrameData; // Update previousFrameData for the next frame
    requestAnimationFrame(processFrame);
}


function detectMovement(currentData, previousData) {
    // Initialize an array to track movement changes
    const movementChanges = [];

    for (let i = 0; i < currentData.length; i += 4) {
        const rDiff = Math.abs(currentData[i] - previousData[i]);
        const gDiff = Math.abs(currentData[i + 1] - previousData[i + 1]);
        const bDiff = Math.abs(currentData[i + 2] - previousData[i + 2]);
        if ((rDiff + gDiff + bDiff) > movementThreshold) {
            // Record the position of movement for later analysis
            const position = { x: (i / 4) % canvas.width, y: Math.floor((i / 4) / canvas.width) };
            movementChanges.push(position);
        }
    }

    return movementChanges;
}

function highlightPredictions(predictions) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (predictions.length === 0) return;

    const largestPrediction = predictions.reduce((prev, current) => {
        const prevArea = (prev.bbox[2] - prev.bbox[0]) * (prev.bbox[3] - prev.bbox[1]);
        const currentArea = (current.bbox[2] - current.bbox[0]) * (current.bbox[3] - current.bbox[1]);
        return prevArea > currentArea ? prev : current;
    });

    const [x, y, width, height] = largestPrediction.bbox;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // Convert to servo angles
    const servoX = interp(centerX, 0, canvas.width, 180, 0);
    const servoY = interp(centerY, 0, canvas.height, 0, 180);

    // Send command via WebSocket
    if (ws.readyState === WebSocket.OPEN) {
        const command = `ServoX${servoX}ServoY${servoY}`;
        ws.send(command);
    }

    // Drawing the bounding box and label
    context.strokeStyle = 'red';
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.fillStyle = 'red';
    context.fillText(largestPrediction.class + ' - ' + Math.round(largestPrediction.score * 100) / 100, x, y > 10 ? y - 5 : 10);
}

function interp(value, fromLow, fromHigh, toLow, toHigh) {
    return (value - fromLow) * (toHigh - toLow) / (fromHigh - fromLow) + toLow;
}


function selectObjectToTrack(predictions) {
    // Example: Select the largest object to track
    return predictions.reduce((prev, current) => {
        const prevArea = (prev.bbox[2]) * (prev.bbox[3]);
        const currentArea = (current.bbox[2]) * (current.bbox[3]);
        return prevArea > currentArea ? prev : current;
    });
}

function overlap(bbox1, bbox2) {
    // Implement a simple overlap check between two bounding boxes
    // This is a placeholder; you'll need to define how to calculate overlap based on your requirements
    return Math.abs(bbox1[0] - bbox2[0]) < 50 && Math.abs(bbox1[1] - bbox2[1]) < 50; // Example threshold
}
