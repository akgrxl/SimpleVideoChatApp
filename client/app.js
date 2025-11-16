const startBtn = document.getElementById('startBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let ws;
let peerConnection;
let localStream;
const roomId = 'default'; // Default room

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// startBtn.addEventListener('click', startCall);

// Auto-join on page load
window.addEventListener('load', joinRoom);

async function joinRoom() {
    // Connect to WebSocket
    ws = new WebSocket(`wss://plmngxuby6.execute-api.ap-south-1.amazonaws.com/prod?roomId=${roomId}`);

    ws.onopen = () => {
        console.log('Connected to signaling server');
        startBtn.disabled = false;
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };

    // Get local stream
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    setTimeout(() => {
        startCall();
    }, 100);
}

async function startCall() {
    peerConnection = new RTCPeerConnection(config);
    peerConnection.addStream(localStream);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage('candidate', event.candidate);
        }
    };

    peerConnection.onaddstream = (event) => {
        remoteVideo.srcObject = event.stream;
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendMessage('offer', offer);
}

function sendMessage(type, payload) {
    const message = {
        roomId: roomId,
        type,
        payload
    };
    ws.send(JSON.stringify(message));
}

async function handleMessage(message) {
    const { type, payload } = message;

    switch (type) {
        case 'offer':
            await handleOffer(payload);
            break;
        case 'answer':
            await handleAnswer(payload);
            break;
        case 'candidate':
            await handleCandidate(payload);
            break;
    }
}

async function handleOffer(offer) {
    peerConnection = new RTCPeerConnection(config);
    peerConnection.addStream(localStream);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage('candidate', event.candidate);
        }
    };

    peerConnection.onaddstream = (event) => {
        remoteVideo.srcObject = event.stream;
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendMessage('answer', answer);
}

async function handleAnswer(answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleCandidate(candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}