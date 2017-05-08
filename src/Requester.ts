import * as https from 'https';
import { HTTPError, TimeoutError } from './errors';

export interface IRequester {
    request(url: string): Promise<any>;
}

export class Requester implements IRequester {
    public request(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const req = https.get(url, res => {
                if (res.statusCode !== 200) {
                    reject(new HTTPError(res.statusCode, res.statusMessage, res));
                }
                let body = '';
                res.on('data', str => body = body + str.toString());
                res.on('end', () => resolve(JSON.parse(body)));
            });
            req.setTimeout(15 * 1000); //tslint:disable-line
            req.on('error', err => reject(err));
            req.on('timeout', () => reject(new TimeoutError('Request timed out')));
        });
    }
}
