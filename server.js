const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { createClient } = require('redis');  // Import createClient from redis
const { Types } = require('mysql');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Enable CORS for both Express and Socket.IO
const io = socketIo(server, {
    cors: {
        origin: [process.env.CORS_DOMAIN], // Allow your React app's domain
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"], // Specify allowed headers
        credentials: true, // Allow credentials (cookies or auth tokens)
    },
});

app.use((req, res, next) => {
    const allowedDomain = process.env.CORS_DOMAIN; // Matches all subdomains of example.com
    const origin = req.headers.origin;
    // Allow CORS for Express routes
    res.setHeader('Access-Control-Allow-Origin', origin ); // React app's origin
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE'); // Allow specific HTTP methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Allow specific headers
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // Allow credentials (cookies)

    // Handle pre-flight requests (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});


app.get('/', (req, res) => {
    res.send('Socket.IO server is running');
});

const redisClient = createClient({
    url: process.env.REDIS_URL, // Redis URL
});

redisClient.connect()
    .then(() => {
        console.log('Connected to Redis');
    })
    .catch((err) => {
        console.error('Error connecting to Redis:', err);
    });

// Handle a connection
io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('submitOrder', async (orderData, ackCallback) => {
        console.log('Received order:');
        try {
            orderData.order_status = 0;
            await redisClient.hSet(`order:${orderData.id}`, Types.JSON, JSON.stringify(orderData));
            console.log(`Order ${orderData.id} updated`);
            axios.post(`${process.env.HTTP}://${orderData.tenant}.${process.env.API_URL}/api/order`, orderData)
                .then(response => {
                    if(response.status != 200)
                        console.log(`Error sending request order:${orderData.id}`);
                    else
                        console.log(`request order:${orderData.id} sending successfully`);
                });
            ackCallback({
                success: true,
                message: 'Order received and stored successfully.',
                order: orderData, // Optionally send back the order ID or other data
            });
        } catch (err) {
            console.error('Error storing order in Redis:', err);
        }
    })

    // Listen for 'order' events
    socket.on('order', async (orderData, ackCallback) => {
        

        try {
            // Store the order in Redis using lPush

            if (!!!orderData.id) {
                console.log('Received New order:');
                const orderId = await redisClient.incr('orderIdCounter');
                orderData.id = orderId;
                await redisClient.hSet(`order:${orderId}`, Types.JSON, JSON.stringify(orderData));
                console.log(`Order ${orderId} added as a hash.`);
            }
            else {
                console.log('Received Updated order:');
                await redisClient.hSet(`order:${orderData.id}`, Types.JSON, JSON.stringify(orderData));
                console.log(`Order ${orderData.id} updated`);
            }

            // Send a response back to the client
            ackCallback({
                success: true,
                message: 'Order received and stored successfully.',
                order: orderData, // Optionally send back the order ID or other data
            });
        } catch (err) {
            console.error('Error storing order in Redis:', err);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('a user disconnected');
    });
});

// Start the server
const port = 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});