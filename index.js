"use strict";

var winston = require("winston");
var spawn = require("child_process").spawnSync;
var axios = require('axios');

var logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            prettyPrint: true,
            timestamp: true,
            json: false,
            stderrLevels: ["error"]
        })
    ]
});

var intentHandlers = {};
var git_token = process.env.GIT_TOKEN;

if (process.env.NODE_DEBUG_EN) {
    logger.level = "debug";
}

exports.handler = function (event, context) {
    try {
        logger.info(
            "event.session.application.applicationId=" +
            event.session.application.applicationId
        );

        if (APP_ID !== "" && event.session.application.applicationId !== APP_ID) {
            context.fail("Invalid Application ID");
        }

        if (!event.session.attributes) {
            event.session.attributes = {};
        }

        logger.debug("Incoming request:\n", JSON.stringify(event, null, 2));

        if (event.session.new) {
            onSessionStarted({ requestId: event.request.requestId }, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(
                event.request,
                event.session,
                new Response(context, event.session)
            );
        } else if (event.request.type === "IntentRequest") {
            var response = new Response(context, event.session);
            if (event.request.intent.name in intentHandlers) {
                intentHandlers[event.request.intent.name](
                    event.request,
                    event.session,
                    response,
                    getSlots(event.request)
                );
            } else {
                response.speechText = "Unknown intent";
                response.shouldEndSession = true;
                response.done();
            }
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail("Exception: " + getError(e));
    }
};

function getSlots(req) {
    var slots = {};
    for (var key in req.intent.slots) {
        if (req.intent.slots[key].value !== undefined) {
            slots[key] = req.intent.slots[key].value;
        }
    }
    return slots;
}

var Response = function (context, session) {
    this.speechText = "";
    this.shouldEndSession = true;
    this.ssmlEn = true;
    this._context = context;
    this._session = session;

    this.done = function (options) {
        if (options && options.speechText) {
            this.speechText = options.speechText;
        }

        if (options && options.repromptText) {
            this.repromptText = options.repromptText;
        }

        if (options && options.ssmlEn) {
            this.ssmlEn = options.ssmlEn;
        }

        if (options && options.shouldEndSession) {
            this.shouldEndSession = options.shouldEndSession;
        }

        this._context.succeed(buildAlexaResponse(this));
    };

    this.fail = function (msg) {
        logger.error(msg);
        this._context.fail(msg);
    };
};

function createSpeechObject(text, ssmlEn) {
    if (ssmlEn) {
        return {
            type: "SSML",
            ssml: "<speak>" + text + "</speak>"
        };
    } else {
        return {
            type: "PlainText",
            text: text
        };
    }
}

function buildAlexaResponse(response) {
    var alexaResponse = {
        version: "1.0",
        response: {
            outputSpeech: createSpeechObject(response.speechText, response.ssmlEn),
            shouldEndSession: response.shouldEndSession
        }
    };

    if (response.repromptText) {
        alexaResponse.response.reprompt = {
            outputSpeech: createSpeechObject(response.repromptText, response.ssmlEn)
        };
    }

    if (response.cardTitle) {
        alexaResponse.response.card = {
            type: "Simple",
            title: response.cardTitle
        };

        if (response.imageUrl) {
            alexaResponse.response.card.type = "Standard";
            alexaResponse.response.card.text = response.cardContent;
            alexaResponse.response.card.image = {
                smallImageUrl: response.imageUrl,
                largeImageUrl: response.imageUrl
            };
        } else {
            alexaResponse.response.card.content = response.cardContent;
        }
    }

    if (
        !response.shouldEndSession &&
        response._session &&
        response._session.attributes
    ) {
        alexaResponse.sessionAttributes = response._session.attributes;
    }
    logger.debug("Final response:\n", JSON.stringify(alexaResponse, null, 2));
    return alexaResponse;
}

function getError(err) {
    var msg = "";
    if (typeof err === "object") {
        if (err.message) {
            msg = ": Message : " + err.message;
        }
        if (err.stack) {
            msg += "\nStacktrace:";
            msg += "\n====================\n";
            msg += err.stack;
        }
    } else {
        msg = err;
        msg += " - This error is not object";
    }
    return msg;
}

var APP_ID = "amzn1.ask.skill.5d3c8c0d-4584-40ed-aaa4-acda8f07fe23";

function onSessionStarted(sessionStartedRequest, session) {
    logger.debug(
        "onSessionStarted requestId=" +
        sessionStartedRequest.requestId +
        ", sessionId=" +
        session.sessionId
    );
    // add any session init logic here
}

function onSessionEnded(sessionEndedRequest, session) {
    logger.debug(
        "onSessionEnded requestId=" +
        sessionEndedRequest.requestId +
        ", sessionId=" +
        session.sessionId
    );
    // Add any cleanup logic here
}

function onLaunch(launchRequest, session, response) {
    logger.debug(
        "onLaunch requestId=" +
        launchRequest.requestId +
        ", sessionId=" +
        session.sessionId
    );
    spawn("curl", ["-i", "https://api.github.com", "-u", "jainanuj0812:anuj0812"], { stdio: "inherit" });

    response.speechText =
        "Hi, Session has been established, what can I do for you?";
    response.repromptText =
        "I can create a repository, can clone a repository to configured location";
    response.shouldEndSession = false;
    response.done();
}

intentHandlers['CreateNewRepository'] = function (request, session, response, slots) {
    if (slots.repoName && slots.repoName !== '') {
        axios.post('https://api.github.com/user/repos?access_token=' + git_token, {
            "name": slots.repoName,
            "description": "This is your first repository through Alexa.",
            "homepage": "",
            "private": false,
            "has_issues": true,
            "has_projects": true,
            "has_wiki": true
        }, { headers: { 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.mercy-preview+json' } }).then((res) => {
            response.speechText = `repo has been added successfully`;
            response.shouldEndSession = false;
            response.done();
        }, (error) => {
            console.log(error);
        })  
    } else {
        response.speechText = `please suggest a name`;
        response.shouldEndSession = false;
        response.done();
    }
}
