import path from 'node:path';
import {buildHistory} from './reporting.mjs';
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--days'))throw Error('Use: report-history.cmd --days 1|7|30');
console.log(JSON.stringify(buildHistory(path.resolve(import.meta.dirname,'../results'),args.length?Number(args[1]):1),null,2));
