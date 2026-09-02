const { listenForMessages } = require('./pubsub');
const { zipPhotosForTags } = require('./zip_service');

const jobs = {};

listenForMessages(process.env.PUBSUB_SUBSCRIPTION, payload => {
  return zipPhotosForTags(payload.tags, payload.tagmode, payload.prenom)
    .then(filename => {
      jobs[payload.tags] = filename;
      console.log(`Zip job done for tags "${payload.tags}": ${filename}`);
    })
    .catch(error => {
      jobs[payload.tags] = 'failed';
      throw error;
    });
});

module.exports = { jobs };
