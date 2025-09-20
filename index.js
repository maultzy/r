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

app.post('/api/upload', (req, res) => {
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
      return res.status(400).json({ status: false, message: 'No file uploaded.' })
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
      res.json({
        status: true,
        message: 'Upload berhasil',
        url: proxiedUrl
      })
    } catch (err) {
      console.error(err.response?.data || err.message)
      res.status(500).json({ status: false, message: 'Gagal upload file.' })
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