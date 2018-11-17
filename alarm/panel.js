'use strict';

const async = require('async');

module.exports = function(RED) {

    var stateListeners = {};

    function AnamicoAlarmPanel(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        this.alarmModes = [ 'Home', 'Away', 'Night', 'Off', 'Alarm' ];

        this.alarmState = node.context().global.get('SecuritySystemCurrentState') || 0;
        this.alarmType = node.context().global.get('SecuritySystemAlarmType') || 0;
        this.isAlarm = node.alarmState === 4;

        this.setAlarmState = function(alarmState) {
            node.alarmState = alarmState;
            node.isAlarm = alarmState === 4;
            node.context().global.set('SecuritySystemCurrentState', alarmState);
        };

        this.setAlarmType = function(alarmType) {
            this.alarmType = alarmType;
            node.context().global.set('SecuritySystemAlarmType', alarmType);
        };

        this.sensor = function(callback) {
            callback(true);
        };

        this.registerStateListener = function(node, callback) {
            stateListeners[node.id] = callback;

            // also emit current state on registration (after delay of 100 msec?):
            setTimeout(function() {
                callback({
                    payload: {
                        //SecuritySystemTargetState: localState,
                        SecuritySystemCurrentState: node.alarmState,
                        alarmState: node.alarmModes[node.alarmState],
                        SecuritySystemAlarmType: node.alarmType,
                        isAlarm: node.isAlarm
                    }
                });
            }, 100);
        };

        this.deregisterStateListener = function(node) {
            node.log('deregister: ' + node.id);
            delete stateListeners[node.id];
        };

        this.notifyChange = function (msg, fromHomekit) {
            if (fromHomekit) {
                node.log("from homekit");
                msg.payload.fromHomekit = true;
            } else {
                node.log("local");
            }
            node.log(JSON.stringify(msg,null,2));

            async.parallel(stateListeners, function(stateListener, callback) {
                stateListener(msg);
                callback(null);
            });
        };

        this.setState = function(msg, callback) {

            // only do something if we have been fed a new security state
            node.log(JSON.stringify(msg,null,2));

            if (!msg.payload) {
                node.error('invalid payload', msg);
                callback({
                    error: true,
                    label: "invalid payload"
                });
                return;
            }

            const targetState = msg.payload.SecuritySystemTargetState;
            const currentState = msg.payload.SecuritySystemCurrentState;
            var newState = currentState !== undefined ? currentState : targetState;
            var newAlarmType = msg.payload.SecuritySystemAlarmType;
            var alarmType = newAlarmType !== undefined ? newAlarmType : node.alarmType;

// look for alarms
            if (msg.payload.zone) {
                if (msg.payload.modes.indexOf(node.alarmState) < 0) {
                    node.log('no alarm');
                    callback({
                        error: true,
                        label: "no alarm"
                    });
                    return
                }
                node.log('Alarm: ');
                newState = 4;
                alarmType = 1;
            }

            node.log('newState: ' + newState + ' = ' + targetState + ' || ' + currentState);
            node.log('localState: ' + node.alarmState);
            node.log('alarmType: ' + alarmType + ' = ' + newAlarmType + ' || ' + node.alarmType);

            if ((newState === undefined) && (newAlarmType === undefined)) {
                node.error('invalid payload', msg);
                callback({
                    error: true,
                    label: "invalid payload"
                });
                return;
            }

// Has anything changed?
            if ((newState !== undefined ? newState : node.alarmState) !== 4 ) {
                alarmType = 0
            }
            const alarmChanged = (node.alarmType != alarmType);
            const changed = (node.alarmState === undefined) || (node.alarmState != newState) || (node.alarmType === undefined)|| alarmChanged;
            if (!changed) {
                node.log('no change');
                callback({
                    label: node.alarmModes[node.alarmState]
                });
                return;
            }

// persist the new state
            node.setAlarmState(newState !== undefined ? newState : node.alarmState);
            node.setAlarmType(alarmType);

            msg.payload = {
                //SecuritySystemTargetState: global.SecuritySystemCurrentState,
                SecuritySystemCurrentState: node.alarmState,
                alarmState: node.alarmModes[node.alarmState]
            };
            msg.payload.isAlarm = node.isAlarm;

            if (alarmChanged) {
                msg.payload.SecuritySystemAlarmType = node.alarmType;
            }

            const fromHomekit = msg.hap && msg.hap.context && (targetState !== undefined);
            delete msg.hap;

            node.notifyChange(msg, fromHomekit);
            callback({
                label: node.alarmModes[node.alarmState]
            });
        };
    }
    RED.nodes.registerType("AnamicoAlarmPanel", AnamicoAlarmPanel);
};

