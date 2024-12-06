const express = require('express');
const Lame = require("node-lame").Lame;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const port = 4100;

const volumePath = '/app/uploads';


app.post('/stream-audio', async (req, res) => {
  console.log('Receiving audio stream...');

  if (!fs.existsSync(volumePath)) {
    console.error('Volume path does not exist:', volumePath);
  }

  const randomName = Array(32)
    .fill(null)
    .map(() => Math.round(Math.random() * 16).toString(16))
    .join('');

  const wavFileName = `${randomName}.wav`;
  const wavFilePath = path.join(volumePath, wavFileName);

  const mp3FileName = `${randomName}.mp3`;
  const mp3FilePath = path.join(volumePath, mp3FileName);

  const fileStream = fs.createWriteStream(wavFilePath);
  req.pipe(fileStream);

  // req.on('data', chunk => {
  //   console.log('Received chunk:', chunk.length);
  // });

  req.on('end', async () => {    
    try {
      console.log('Stream received successfully. converting wav to mp3...');
      const encoder = new Lame({ output: mp3FilePath, bitrate: 64 }).setFile(wavFilePath);
      await encoder.encode();
      console.log('Conversion completed successfully');
      // Create FormData to send the file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(wavFilePath), {
        filename: mp3FileName,
        contentType: 'audio/mpeg3'
      });
      formData.append('chatId', req.query.chatId);
      formData.append('content', "test is love");

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: req.headers.authorization
        }
      };
      // Send to another server (replace with your target server URL)
      await axios.post('http://backend:4000/messages', formData, config);

      console.log('File forwarded successfully.');

      // Delete files
      console.log('Deleting files...');
      await fs.unlink(mp3FilePath, () => console.log('Deleted:', mp3FilePath));
      await fs.unlink(wavFilePath, () => console.log('Deleted:', wavFilePath));
      

      res.status(200).send('Stream received and forwarded successfully');
    } catch (error) {
      console.error('Error forwarding file:', error.message);
      res.status(500).send('Error processing stream');
    }
  });

  req.on('close', () => {
    console.error('Client connection closed');
  });

  req.on('error', (err) => {
    console.error('Error receiving stream:', err);
    res.status(500).send('Error processing stream');
  });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});