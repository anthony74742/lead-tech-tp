const crypto = require('crypto');
const archiver = require('archiver');
const got = require('got');
const { Storage } = require('@google-cloud/storage');
const photoModel = require('./photo_model');

const storage = new Storage();

function buildZip(photos) {
  const downloads = photos.map(photo =>
    got.default.get(photo.media.m, { responseType: 'buffer' })
  );

  return Promise.all(downloads).then(responses => {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip');
      const chunks = [];

      archive.on('data', chunk => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('end', () => resolve(Buffer.concat(chunks)));

      responses.forEach((response, i) => archive.append(response.body, { name: `${i}.jpg` }));
      archive.finalize();
    });
  });
}

function uploadZip(zipBuffer) {
  const filename = `${crypto.randomUUID()}.zip`;
  const stream = storage
    .bucket(process.env.GCS_BUCKET)
    .file(filename)
    .createWriteStream({
      metadata: { contentType: 'application/zip', cacheControl: 'private' },
      resumable: false
    });

  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', () => resolve(filename));
    stream.end(zipBuffer);
  });
}

function getDownloadUrl(filename) {
  const options = {
    action: 'read',
    expires: Date.now() + 2 * 24 * 60 * 60 * 1000
  };

  return storage
    .bucket(process.env.GCS_BUCKET)
    .file(filename)
    .getSignedUrl(options)
    .then(signedUrls => signedUrls[0]);
}

function zipPhotosForTags(tags, tagmode) {
  return photoModel
    .getFlickrPhotos(tags, tagmode)
    .then(photos => buildZip(photos.slice(0, 10)))
    .then(uploadZip);
}

module.exports = { zipPhotosForTags, getDownloadUrl };
