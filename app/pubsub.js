const { PubSub } = require('@google-cloud/pubsub');

const pubSubClient = new PubSub({ projectId: process.env.GCP_PROJECT_ID });

const topicName = process.env.PUBSUB_TOPIC;

async function publishMessage(payload) {
  const data = Buffer.from(JSON.stringify(payload));
  const messageId = await pubSubClient.topic(topicName).publishMessage({ data });
  console.log(`Message ${messageId} published to topic ${topicName}`);
  return messageId;
}

function listenForMessages(subscriptionName, handleMessage) {
  const subscription = pubSubClient.subscription(subscriptionName);

  subscription.on('message', message => {
    console.log(`Received message ${message.id}: ${message.data}`);

    return handleMessage(JSON.parse(message.data.toString()))
      .catch(error => console.error(`Job failed for message ${message.id}`, error))
      .then(() => message.ack());
  });

  subscription.on('error', error => console.error(`Subscription error`, error));

  console.log(`Listening for messages on subscription ${subscriptionName}`);
}

module.exports = { publishMessage, listenForMessages };
