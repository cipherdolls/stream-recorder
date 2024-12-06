const recorder = require('node-record-lpcm16');  // For recording audio
const request = require('request');  
const fs = require('fs');                        // For file system access
const path = require('path');                    // For path handling


const apikey = '3a530948-ccb8-4b73-9d06-ca13c5f746c8'
const chatId = 'a718a24a-0377-4e1a-9c27-ab1faa47acc7';  // The chat ID for your chat
const apiUrl = `https://api.cipherdolls.com/messages/stream?chatId=${chatId}`;  // Your API endpoint for receiving audio data


const recording = recorder.record({
  recorder: 'arecord'
});


function parseResult (err, resp, body) {
  if (err) console.error(err)
  console.log(body)
}


recording.stream().pipe(request.post({
    url: apiUrl,
    headers: {
      'Authorization': `Bearer ${apikey}`,
      'accept-encoding': 'identity',
      'Accept': '*/*',
      'Content-Type': 'audio/wav',
      'Transfer-Encoding': 'chunked',
    },
  }, parseResult))

 
setTimeout(() => {
    recording.stop()
}, 3000) // Stop after three seconds of recording





