let worker;
let listenForMessages;
let zipPhotosForTags;
let capturedHandler;

beforeEach(() => {
  jest.resetModules();

  listenForMessages = jest.fn((subscriptionName, handler) => {
    capturedHandler = handler;
  });

  jest.doMock('../../app/pubsub', () => ({
    listenForMessages
  }));

  zipPhotosForTags = jest.fn(() => Promise.resolve('generated.zip'));

  jest.doMock('../../app/zip_service', () => ({
    zipPhotosForTags
  }));

  worker = require('../../app/worker');
});

test('should start listening for messages on the configured subscription', () => {
  expect(listenForMessages).toHaveBeenCalledWith(
    process.env.PUBSUB_SUBSCRIPTION,
    expect.any(Function)
  );
});

test('should store the generated filename in jobs once zipping completes', () => {
  const payload = { tags: 'california', tagmode: 'all', prenom: 'anthony' };

  return capturedHandler(payload).then(() => {
    expect(zipPhotosForTags).toHaveBeenCalledWith('california', 'all', 'anthony');
    expect(worker.jobs.california).toBe('generated.zip');
  });
});
