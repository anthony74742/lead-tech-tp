const crypto = require('crypto');
const archiver = require('archiver');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const photoModel = require('./photo_model');
const { db } = require('./firebase');

const storage = new Storage();

async function buildZip(photos) {
  const archive = archiver('zip');

  await Promise.all(
    photos.map(async (photo, i) => {
      const response = await axios.get(photo.media.m, {
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      archive.append(response.data, { name: `${i}.jpg` });
    })
  );

  archive.finalize();

  return archive;
}

function uploadZip(archive) {
  const filename = `${crypto.randomUUID()}.zip`;
  const stream = storage
    .bucket(process.env.GCS_BUCKET)
    .file(filename)
    .createWriteStream({
      metadata: { contentType: 'application/zip', cacheControl: 'private' },
      resumable: false
    });

  return new Promise((resolve, reject) => {
    archive.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', () => resolve(filename));
    archive.pipe(stream);
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

async function saveJobToFirebase(prenom, filename, gcsPath) {
  const heureDuZippage = Date.now();

  await db
    .ref(`/${prenom}/${heureDuZippage}`)
    .set({
      filename,
      path: gcsPath
    });
}

function getGeneratedZips(prenom) {
  return db
    .ref(`/${prenom}`)
    .once('value')
    .then(snapshot => snapshot.val() || {});
}

function zipPhotosForTags(tags, tagmode, prenom) {
  return photoModel
    .getFlickrPhotos(tags, tagmode)
    .then(photos => buildZip(photos.slice(0, 10)))
    .then(uploadZip)
    .then(filename =>
      saveJobToFirebase(prenom, filename, filename).then(() => filename)
    );
}

module.exports = { zipPhotosForTags, getDownloadUrl, getGeneratedZips };
