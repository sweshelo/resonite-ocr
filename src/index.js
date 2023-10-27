const fs = require('fs')
const sharp = require('sharp');
const crypto = require('crypto')
const { ComputerVisionClient } = require("@azure/cognitiveservices-computervision");
const { CognitiveServicesCredentials } = require("@azure/ms-rest-azure-js");
const express = require('express');
const bodyParser = require('body-parser');

require('dotenv').config();

const generateImage = async(string, width, height) => {
  const buffer = new Uint8Array( width * height * 4 ).fill(255);

  for(let index = 0; index < (width * height); index++) {
    const color = parseInt(string[index], 16) * 16
    buffer[index * 4 + 0] = color
    buffer[index * 4 + 1] = color
    buffer[index * 4 + 2] = color
    buffer[index * 4 + 3] = 255
  }

  const image = sharp(buffer,
    {
      raw: {
        width,
        height,
        channels: 4,
      },
    }
  );

  const fileId = crypto.randomUUID()
  await image.toFile(`img/${fileId}.png`)

  return fileId
}

const ocr = async(client, fileId, options) => {
  const recognizedText = []

  const imagePath = `img/${fileId}.png`;
  const fileBuffer = fs.readFileSync(imagePath);

  const result = await new Promise((resolve, reject) => {
    client
      .readInStream(fileBuffer, options)
      .then((result) => {
        resolve(result);
      })
      .catch((err) => {
        reject(err);
      });
  })

  while(true){
    const _result = await client.getReadResult(result['apim-request-id'])
    _result.analyzeResult?.readResults.map((results) => {
      results.lines.forEach((line) => {
        recognizedText.push(line.text)
      })
    })
    if (_result.status === 'succeeded') break
  }

  return recognizedText.join('\n')
}


async function main() {
  const computerVisionKey = process.env.AZURE_COMPUTER_VISION_KEY
  const computerVisionEndPoint = process.env.AZURE_COMPUTER_VISION_ENDPOINT
  const cognitiveServiceCredentials = new CognitiveServicesCredentials(computerVisionKey);
  const client = new ComputerVisionClient(cognitiveServiceCredentials, computerVisionEndPoint);

  // Setup server and uses.
  const app = express();
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json({limit: '100mb'}));
  app.listen(8080);

  app.post('/image', async(req, res) => {
    const imageStr = req.param('image')
    const width = req.param('width') ?? 512
    const height = req.param('height') ?? 256
    const result = await generateImage(imageStr, width, height)
    res.send(result)
  })

  app.post('/result/:fileId', async(req, res) => {
    const fileId = req.param('fileId')
    const language = req.param('lang') ?? 'ja'
    const result = await ocr(client, fileId, {
      language
    })
    res.send(result)
  })
}

main();
