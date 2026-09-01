const axios = require('axios');
const querystring = require('querystring');
const jsonpHelper = require('./jsonp_helper');

function getFlickrPhotos(tags, tagmode) {
  const qs = querystring.stringify({ tags, tagmode, format: 'json' });

  const url = `https://api.flickr.com/services/feeds/photos_public.gne?${qs}`;

  return axios.get(url).then(response => {
    const photoFeed = jsonpHelper.parseJSONP(response.data);

    photoFeed.items.forEach(photo => {
      photo.media.t = photo.media.m.split('m.jpg')[0] + 't.jpg';
      photo.media.b = photo.media.m.split('m.jpg')[0] + 'b.jpg';
    });

    return photoFeed.items;
  });
}

module.exports = {
  getFlickrPhotos
};
