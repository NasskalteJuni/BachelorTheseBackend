/**
 * A module that offers a read line to react to server input,
 * mainly for debugging reasons
 * @module
 * */
const readline = require('readline');
const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: false});
module.exports = rl;