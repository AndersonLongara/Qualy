import axios from 'axios';

const API = 'http://localhost:3000/api/chat';
const PHONE = `debug-${Date.now()}`;

async function run() {
    try {
        console.log(">> oi");
        let res = await axios.post(API, { message: "oi", phone: PHONE });
        console.log("<<", res.data.reply);

        console.log(">> qual é o estoque do produto PROD-001 ?");
        res = await axios.post(API, { message: "qual é o estoque do produto PROD-001 ?", phone: PHONE });
        console.log("<<", res.data.reply);

        const fs = require('fs');
        fs.writeFileSync('debug-api-response.json', JSON.stringify({
            reply: res.data.reply,
            debug: res.data.debug
        }, null, 2));
        console.log("Saved to debug-api-response.json");

    } catch (e: any) {
        console.error("ERROR:", e.response ? e.response.data : e);
    }
}

run();
