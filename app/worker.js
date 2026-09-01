const { listenForMessages } = require('./pubsub');
const { zipPhotosForTags } = require('./zip_service');

// "BDD" du pauvre : les jobs termines, cle = tags, valeur = nom du zip dans le bucket.
// Fonctionne uniquement parce que le worker tourne dans la meme instance que l'API.
const jobs = {};

listenForMessages(process.env.PUBSUB_SUBSCRIPTION, payload => {
  return zipPhotosForTags(payload.tags, payload.tagmode).then(filename => {
    jobs[payload.tags] = filename;
    console.log(`Zip job done for tags "${payload.tags}": ${filename}`);
  });
});

module.exports = { jobs };
