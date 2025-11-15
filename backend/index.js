const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

const TABLE_NAME = process.env.TABLE_NAME;

exports.handler = async (event) => {
    const { requestContext, body } = event;
    const connectionId = requestContext.connectionId;
    const routeKey = requestContext.routeKey;

    let data = {};
    if (body) {
        try {
            data = JSON.parse(body);
        } catch (e) {
            data = {};
        }
    }

    switch (routeKey) {
        case '$connect':
            return await handleConnect(connectionId, event);
        case '$disconnect':
            return await handleDisconnect(connectionId);
        case '$default':
            return await handleMessage(connectionId, data);
        default:
            return { statusCode: 400 };
    }
};

async function handleConnect(connectionId, event) {
    const roomId = event.queryStringParameters?.roomId;
    if (!roomId) return { statusCode: 400 };

    const params = {
        TableName: TABLE_NAME,
        Key: { roomId },
        UpdateExpression: 'ADD connections :conn',
        ExpressionAttributeValues: { ':conn': ddb.createSet([connectionId]) },
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        await ddb.update(params).promise();
        return { statusCode: 200 };
    } catch (err) {
        console.error(err);
        return { statusCode: 500 };
    }
}

async function handleDisconnect(connectionId) {
    // Find the room and remove connection
    // This is simplified; in real app, scan or use GSI
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'contains(connections, :conn)',
        ExpressionAttributeValues: { ':conn': connectionId }
    };

    try {
        const result = await ddb.scan(params).promise();
        for (const item of result.Items) {
            const updateParams = {
                TableName: TABLE_NAME,
                Key: { roomId: item.roomId },
                UpdateExpression: 'DELETE connections :conn',
                ExpressionAttributeValues: { ':conn': ddb.createSet([connectionId]) }
            };
            await ddb.update(updateParams).promise();
        }
        return { statusCode: 200 };
    } catch (err) {
        console.error(err);
        return { statusCode: 500 };
    }
}

async function handleMessage(connectionId, data) {
    const { roomId, type, payload } = data;
    if (!roomId) return { statusCode: 400 };

    // Get connections in room
    const params = {
        TableName: TABLE_NAME,
        Key: { roomId }
    };

    try {
        const result = await ddb.get(params).promise();
        const connections = result.Item ? result.Item.connections.values : [];

        const apiGateway = new AWS.ApiGatewayManagementApi({
            endpoint: process.env.WEBSOCKET_ENDPOINT,
            region: process.env.AWS_REGION
        });

        const message = { type, payload, from: connectionId };

        for (const connId of connections) {
            if (connId !== connectionId) {
                await apiGateway.postToConnection({
                    ConnectionId: connId,
                    Data: JSON.stringify(message)
                }).promise();
            }
        }

        return { statusCode: 200 };
    } catch (err) {
        console.error(err);
        return { statusCode: 500 };
    }
}