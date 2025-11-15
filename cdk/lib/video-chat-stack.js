const { Stack, CfnOutput } = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const s3deploy = require('aws-cdk-lib/aws-s3-deployment');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigatewayv2 = require('aws-cdk-lib/aws-apigatewayv2');
const integrations = require('aws-cdk-lib/aws-apigatewayv2-integrations');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const iam = require('aws-cdk-lib/aws-iam');
const path = require('path');

class VideoChatStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // DynamoDB table for rooms
    const table = new dynamodb.Table(this, 'RoomsTable', {
      partitionKey: { name: 'roomId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Lambda function
    const lambdaFunction = new lambda.Function(this, 'SignalingFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend')),
      handler: 'index.handler',
      environment: {
        TABLE_NAME: table.tableName,
        WEBSOCKET_ENDPOINT: '', // Will be set after API creation
      },
    });

    table.grantReadWriteData(lambdaFunction);

    // WebSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'SignalingApi', {
        connectRouteOptions: {
            integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', lambdaFunction),
        },
        disconnectRouteOptions: {
            integration: new integrations.WebSocketLambdaIntegration('DisconnectIntegration', lambdaFunction),
        },
        defaultRouteOptions: {
            integration: new integrations.WebSocketLambdaIntegration('DefaultIntegration', lambdaFunction),
        },
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'SignalingStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Add permission for WebSocket management
    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`]
    }));

    // Set the WebSocket endpoint in Lambda environment
    lambdaFunction.addEnvironment('WEBSOCKET_ENDPOINT', webSocketStage.url.replace('wss://', 'https://'));

    // S3 bucket for frontend
    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    });

    // Deploy frontend files
    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../client'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new CfnOutput(this, 'WebSocketUrl', {
      value: webSocketStage.url,
      description: 'WebSocket API URL',
    });

    new CfnOutput(this, 'FrontendUrl', {
      value: distribution.distributionDomainName,
      description: 'CloudFront URL for frontend',
    });
  }
}

module.exports = { VideoChatStack };