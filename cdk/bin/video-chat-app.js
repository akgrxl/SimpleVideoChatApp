#!/usr/bin/env node

const cdk = require('aws-cdk-lib');
const { VideoChatStack } = require('../lib/video-chat-stack');

const app = new cdk.App();
new VideoChatStack(app, 'VideoChatStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});