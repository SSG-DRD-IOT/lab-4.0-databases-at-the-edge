/*
 * Author: Daniel Holmlund <daniel.w.holmlund@Intel.com>
 * Copyright (c) 2015 Intel Corporation.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// Load the application configuration file or exit the process
try {
 var config = require("./config.json")
}
catch (e) {
 console.log(e)
 process.exit(1);
}

// Load NodeJS Library to interact with the filesystem
var fs = require('fs');

// A library to colorize console output
var chalk = require('chalk');

// Require MQTT and setup the connection to the broker
var mqtt = require('mqtt');

// Require the MongoDB libraries and connect to the database
var mongoose = require('mongoose');

// Create a connection to the database
mongoose.connect(config.mongodb.host);
var db = mongoose.connection;

// Report database errors to the console
db.on('error', console.error.bind(console, 'connection error:'));

// Log when a connection is established to the MongoDB server
db.once('open', function (callback) {
    console.log(chalk.bold.yellow("Connection to MongoDB successful"));
});

// Import the Database Model Objects
var Data = require('intel-commercial-edge-network-database-models').Data;
var Sensor = require('intel-commercial-edge-network-database-models').Sensor;

// Write startup message to the console
console.log(chalk.bold.yellow("Monitor server is starting"));

// Read in the server key and cert and the CA certs
try {
  var KEY = fs.readFileSync(config.tls.serverKey);
  var CERT = fs.readFileSync(config.tls.serverCrt);
  var TRUSTED_CA_LIST = [fs.readFileSync(config.tls.ca_certificates)];
} catch (err) {
  console.error(chalk.bold.red("Unable to find the TLS certs. Please see the first section of the security lab for instructions on creating TLS keys and certificates"))
  console.error(err)
  process.exit()
}

// options - an object to initialize the TLS connection settings
var options = {
  port: config.tls.port,
  host: config.tls.host,
  protocol: 'mqtts',
  protocolId: 'MQIsdp',
  keyPath: KEY,
  certPath: CERT,
  rejectUnauthorized : false,
  //The CA list will be used to determine if server is authorized
  ca: TRUSTED_CA_LIST,
  secureProtocol: 'TLSv1_method',
  protocolVersion: 3
};

// Connect to the MQTT server
var mqttClient  = mqtt.connect(options);

// MQTT connection function
mqttClient.on('connect', function () {
    console.log(chalk.bold.yellow("Connected to MQTT server"));

    // Subscribe to the MQTT topics
    mqttClient.subscribe('announcements');
    mqttClient.subscribe('sensors/+/data');
});

// MQTT error function - Client unable to connect
mqttClient.on('error', function () {
    console.log(chalk.bold.yellow("Unable to connect to MQTT server"));
    process.exit();
});

// A function that runs when MQTT receives a message
mqttClient.on('message', function (topic, message) {
    // Parse the incoming data
    try {
        json = JSON.parse(message);
    } catch(e) {
        console.log(e);
    }

    if (topic == "announcements") {
        // console.log("Received an announcement of a new edge sensor");
        // console.log(topic + ":" + message.toString());

        var sensor = new Sensor(json);
        sensor.save(function(err, sensor) {
            if (err)
                console.error(err);
            else
                console.log(chalk.bold.yellow("Wrote data to db:") + topic + ":" + chalk.white(message.toString()));
        });
    };

    if (topic.match(/data/)) {
        var value = new Data(json);
        value.save(function(err, data) {
            if (err)
                console.error(err);
            else
                console.log(chalk.bold.yellow("Wrote data to db:") + topic + ":" + chalk.white(message.toString()));
        });
    }
});
