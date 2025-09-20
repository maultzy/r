const express = require('express')
const axios = require('axios')
const mime = require('mime-types')
const busboy = require('busboy')

const app = express()
const port = process.env.PORT || 3000

const githubToken = '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'
const owner = 'maultzy'
const repo = 'r'
const branch = 'main'
const domain = 'https://r-livid.vercel.app'

async function ensureUploadsFolder() {
  try {
    await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/uploads`, {
      headers: { Authorization: `Bearer ${githubToken}` }
    })
  } catch (err) {
    if (err.response?.status === 404) {
      await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/uploads/.gitkeep`,
        {
          message: 'Create uploads folder',
          content: Buffer.from('').toString('base64'),
          branch: branch
        },
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json'
          }
        }
      )
    }
  }
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
})

app.post('/upload', (req, res) => {
  const bb = busboy({ headers: req.headers })
  let fileBuffer = null
  let fileName = null

  bb.on('file', (name, file, info) => {
    const { filename } = info
    fileName = `${Date.now()}.${mime.extension(mime.lookup(filename) || 'bin')}`
    const chunks = []
    file.on('data', (chunk) => chunks.push(chunk))
    file.on('end', () => {
      fileBuffer = Buffer.concat(chunks)
    })
  })

  bb.on('close', async () => {
    if (!fileBuffer) {
      return res.status(400).send('Tidak ada file yang diupload.')
    }

    const filePath = `uploads/${fileName}`
    const base64Content = fileBuffer.toString('base64')

    try {
      await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        {
          message: `Upload file ${fileName}`,
          content: base64Content,
          branch: branch
        },
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      const proxiedUrl = `${domain}/uploads/${fileName}`
      res.send(`
        <!DOCTYPE html>
        <html lang="en" class="dark">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Upload Berhasil</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: sans-serif; background: #0f172a; }
            .glass {
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.1);
              backdrop-filter: blur(14px);
            }
          </style>
        </head>
        <body class="text-white flex justify-center items-center min-h-screen">
          <div class="glass p-8 rounded-2xl shadow-2xl max-w-lg w-full text-center">
            <h1 class="text-3xl font-bold text-green-400 mb-4">✅ Upload Berhasil</h1>
            <p class="text-gray-300 mb-2">Link File:</p>
            <a href="${proxiedUrl}" target="_blank" class="text-blue-400 underline break-all">${proxiedUrl}</a>
            <div class="mt-6 flex justify-center gap-3">
              <button onclick="navigator.clipboard.writeText('${proxiedUrl}').then(()=>alert('✅ URL berhasil disalin'))" class="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg font-semibold">Copy URL</button>
              <a href="/" class="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold">Back</a>
            </div>
          </div>
        </body>
        </html>
      `)
    } catch (err) {
      console.error(err.response?.data || err.message)
      res.status(500).send('Gagal upload file.')
    }
  })

  req.pipe(bb)
})

app.get('/uploads/:filename', async (req, res) => {
  const githubRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/uploads/${req.params.filename}`
  try {
    const mimeType = mime.lookup(req.params.filename) || 'application/octet-stream'
    const fileStream = await axios({
      method: 'GET',
      url: githubRawUrl,
      responseType: 'arraybuffer'
    })

    res.setHeader('Content-Type', mimeType)
    if (mimeType.startsWith('image/') || mimeType.startsWith('text/') || mimeType === 'application/pdf') {
      res.setHeader('Content-Disposition', 'inline')
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`)
    }
    res.send(Buffer.from(fileStream.data))
  } catch (err) {
    if (err.response?.status === 404) {
      res.status(404).send('File tidak ditemukan.')
    } else {
      console.error(err.message)
      res.status(500).send('Gagal mengambil file dari server.')
    }
  }
})

app.listen(port, async () => {
  await ensureUploadsFolder()
  console.log(`Server running at ${domain} or http://localhost:${port}`)
})