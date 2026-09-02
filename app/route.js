const querystring = require('querystring');
const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const { publishMessage } = require('./pubsub');
const { getDownloadUrl, getGeneratedZips } = require('./zip_service');
const { jobs } = require('./worker');
const { rateLimiterMiddleware } = require('./rate_limiter');

function route(app) {
  app.get('/zips', (req, res) => {
    return getGeneratedZips(process.env.PRENOM)
      .then(zips => res.json(zips))
      .catch(error => res.status(500).send({ error: error.message }));
  });

  app.get('/', (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false,
      zipUrl: '',
      zipPending: false,
      zipFailed: false
    };

    // if no input params are passed in then render the view with out querying the api
    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    // validate query parameters
    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    // get photos from flickr public feed api
    return photoModel
      .getFlickrPhotos(tags, tagmode)
      .then(photos => {
        ejsLocalVariables.photos = photos;
        ejsLocalVariables.searchResults = true;

        // pas de zip demande pour ces tags
        if (!(tags in jobs)) {
          return res.render('index', ejsLocalVariables);
        }

        if (jobs[tags] === 'failed') {
          ejsLocalVariables.zipFailed = true;
          return res.render('index', ejsLocalVariables);
        }

        // job encore en cours : la page se rafraichira toute seule
        if (!jobs[tags]) {
          ejsLocalVariables.zipPending = true;
          return res.render('index', ejsLocalVariables);
        }

        return getDownloadUrl(jobs[tags]).then(url => {
          ejsLocalVariables.zipUrl = url;
          return res.render('index', ejsLocalVariables);
        });
      })
      .catch(error => {
        console.log('aspdfonaposd', error)
        return res.status(500).send({ error });
      });
  });

  app.post('/zip', rateLimiterMiddleware, (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    // job en cours : le worker remplacera cette valeur par le nom du zip
    jobs[tags] = null;

    return publishMessage({ tags, tagmode, prenom: process.env.PRENOM, requestedAt: new Date().toISOString() })
      .then(() => {
        const qs = querystring.stringify({ tags, tagmode });
        return res.redirect(`/?${qs}`);
      })
      .catch(error => {
        console.log('pubsub publish error', error);
        return res.status(500).send({ error: error.message });
      });
  });
}

module.exports = route;
