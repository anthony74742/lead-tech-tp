let pubsub;
let mockTopic;
let mockSubscription;
let handlers;

function setupMocks() {
  handlers = {};

  mockTopic = {
    publishMessage: jest.fn(() => Promise.resolve('message-id-123'))
  };

  mockSubscription = {
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
    })
  };

  jest.doMock('@google-cloud/pubsub', () => {
    return {
      PubSub: jest.fn().mockImplementation(() => ({
        topic: jest.fn(() => mockTopic),
        subscription: jest.fn(() => mockSubscription)
      }))
    };
  });
}

describe('publishMessage(payload)', () => {
  beforeEach(() => {
    jest.resetModules();
    setupMocks();
    pubsub = require('../../app/pubsub');
  });

  test('should publish the payload to the configured topic and return the message id', () => {
    return pubsub.publishMessage({ tags: 'california' }).then(messageId => {
      expect(messageId).toBe('message-id-123');
      expect(mockTopic.publishMessage).toHaveBeenCalledWith({
        data: Buffer.from(JSON.stringify({ tags: 'california' }))
      });
    });
  });
});

describe('listenForMessages(subscriptionName, handleMessage)', () => {
  beforeEach(() => {
    jest.resetModules();
    setupMocks();
    pubsub = require('../../app/pubsub');
  });

  test('should register message and error handlers on the subscription', () => {
    const handleMessage = jest.fn(() => Promise.resolve());
    pubsub.listenForMessages('my-subscription', handleMessage);

    expect(mockSubscription.on).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
    expect(mockSubscription.on).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    );
  });

  test('should call handleMessage with the parsed payload and ack the message', () => {
    const handleMessage = jest.fn(() => Promise.resolve());
    pubsub.listenForMessages('my-subscription', handleMessage);

    const message = {
      id: 'msg-1',
      data: Buffer.from(JSON.stringify({ tags: 'california' })),
      ack: jest.fn()
    };

    return handlers.message(message).then(() => {
      expect(handleMessage).toHaveBeenCalledWith({ tags: 'california' });
      expect(message.ack).toHaveBeenCalled();
    });
  });

  test('should ack the message even when handleMessage rejects', () => {
    const handleMessage = jest.fn(() => Promise.reject(new Error('boom')));
    pubsub.listenForMessages('my-subscription', handleMessage);

    const message = {
      id: 'msg-2',
      data: Buffer.from(JSON.stringify({ tags: 'california' })),
      ack: jest.fn()
    };

    return handlers.message(message).then(() => {
      expect(message.ack).toHaveBeenCalled();
    });
  });

  test('should not throw when the subscription emits an error', () => {
    const handleMessage = jest.fn(() => Promise.resolve());
    pubsub.listenForMessages('my-subscription', handleMessage);

    expect(() => handlers.error(new Error('subscription error'))).not.toThrow();
  });
});
