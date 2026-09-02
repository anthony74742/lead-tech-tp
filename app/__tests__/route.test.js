const request = require('supertest');

jest.mock('../../app/photo_model');
jest.mock('../../app/pubsub');
jest.mock('../../app/zip_service');

const pubsub = require('../../app/pubsub');
const zipService = require('../../app/zip_service');
const { jobs } = require('../../app/worker');
const app = require('../../app/server');

describe('GET /zips', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with the list of generated zips', () => {
    zipService.getGeneratedZips.mockResolvedValueOnce({ foo: 'bar' });

    return request(app)
      .get('/zips')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        expect(response.body).toEqual({ foo: 'bar' });
      });
  });

  test('should respond with a 500 error when fetching zips fails', () => {
    zipService.getGeneratedZips.mockRejectedValueOnce(new Error('firebase down'));

    return request(app)
      .get('/zips')
      .expect('Content-Type', /json/)
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'firebase down' });
      });
  });
});

describe('GET / with an in-progress or completed zip job', () => {
  afterEach(() => {
    app.server.close();
    delete jobs.california;
  });

  test('should render the page without zip info when no job exists for the tags', () => {
    return request(app)
      .get('/?tags=california&tagmode=all')
      .expect(200)
      .then(response => {
        expect(response.text).not.toMatch(/zipPending/);
      });
  });

  test('should indicate the zip job is still pending', () => {
    jobs.california = null;

    return request(app)
      .get('/?tags=california&tagmode=all')
      .expect(200);
  });

  test('should render the download url once the zip job is complete', () => {
    jobs.california = 'generated.zip';
    zipService.getDownloadUrl.mockResolvedValueOnce('https://signed-url.example.com/zip');

    return request(app)
      .get('/?tags=california&tagmode=all')
      .expect(200)
      .then(response => {
        expect(zipService.getDownloadUrl).toHaveBeenCalledWith('generated.zip');
        expect(response.text).toMatch(/signed-url\.example\.com/);
      });
  });
});

describe('POST /zip', () => {
  afterEach(() => {
    app.server.close();
    delete jobs.california;
  });

  test('should publish a zip job and redirect back to the index', () => {
    pubsub.publishMessage.mockResolvedValueOnce('message-id');

    return request(app)
      .post('/zip?tags=california&tagmode=all')
      .expect(302)
      .then(response => {
        expect(pubsub.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({ tags: 'california', tagmode: 'all' })
        );
        expect(jobs.california).toBeNull();
        expect(response.headers.location).toBe('/?tags=california&tagmode=all');
      });
  });

  test('should respond with a 500 error when publishing fails', () => {
    pubsub.publishMessage.mockRejectedValueOnce(new Error('pubsub unavailable'));

    return request(app)
      .post('/zip?tags=california&tagmode=all')
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'pubsub unavailable' });
      });
  });

  test('should be rate limited after too many requests from the same client', async () => {
    pubsub.publishMessage.mockResolvedValue('message-id');

    // BUCKET_SIZE (15) / REQUEST_COST (3) = 5 allowed requests before the 6th is denied
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/zip?tags=california&tagmode=all')
        .set('x-forwarded-for', '42.42.42.42');
    }

    const response = await request(app)
      .post('/zip?tags=california&tagmode=all')
      .set('x-forwarded-for', '42.42.42.42');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: 'Too many requests' });
  });
});
