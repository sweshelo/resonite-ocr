const fs = require('fs')
const WebSocket = require('ws');
const sharp = require('sharp');
const crypto = require('crypto')
const { ComputerVisionClient } = require("@azure/cognitiveservices-computervision");
const { CognitiveServicesCredentials } = require("@azure/ms-rest-azure-js");

require('dotenv').config();

async function main() {
  const computerVisionKey = process.env.AZURE_COMPUTER_VISION_KEY
  const computerVisionEndPoint = process.env.AZURE_COMPUTER_VISION_ENDPOINT
  const cognitiveServiceCredentials = new CognitiveServicesCredentials(computerVisionKey);
  const client = new ComputerVisionClient(cognitiveServiceCredentials, computerVisionEndPoint);
  const wss = new WebSocket.Server({ port: 8080 });

  const sessionData = {}

  wss.on('connection', (ws) => {
    const sessionId = crypto.randomUUID()
    ws.sessionId = sessionId;
    sessionData[sessionId] = null;
    console.log(`connection opened: ${sessionId}`)

    ws.on('message', async (message) => {
      switch(message.toString()){
        case 'init':
          sessionData[sessionId] = {
            index: 0,
            content: '',
          }
          console.log(`[session initialized] ${sessionId}`)
          break
        case 'comp':
          console.log(`[complete requested]`)
          if (sessionData[sessionId] && sessionData[sessionId].content.length === 512*256){
            await generateImage(sessionData[sessionId].content)
            console.log(`[completed]`)
            const text = await ocr()
            console.log(text)
            ws.send(JSON.stringify(text))
          }else{
            console.log(`[complete failed] ${sessionData[sessionId].content.length}`)
          }
          break
        default:
          if (sessionData[sessionId]){
            sessionData[sessionId].index++;
            sessionData[sessionId].content += message;
          }else{
            console.log(`[push failed]`)
          }
          break
      }
    });

    ws.on('close', () => {
      delete sessionData[sessionId];
    });
  });

  const generateImage = async(string) => {
    const buffer = new Uint8Array( 512 * 256 * 4 ).fill(255);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 512; x++) {
        const index = x + y * 512;
        const color = parseInt(string[index], 16) * 16
        buffer[index * 4 + 0] = color
        buffer[index * 4 + 1] = color
        buffer[index * 4 + 2] = color
        buffer[index * 4 + 3] = 255
      }
    }

    const image = sharp(buffer,
      {
        raw: {
          width: 512,
          height: 256,
          channels: 4,
        },
      }
    );

    const fileStream = await image.toFile('output.png')
    console.log('File saved:', fileStream);
  }

  const ocr = async() => {
    const recognizedText = []
    const options = {
      language: "ja"
    };

    const imagePath = 'output.png';
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
      console.log(_result)
      _result.analyzeResult?.readResults.map((results) => {
        results.lines.forEach((line) => {
          recognizedText.push(line.text)
        })
      })
      console.log(JSON.stringify(_result))
      if (_result.status === 'succeeded') break
    }

    return recognizedText
  }
}

main();
