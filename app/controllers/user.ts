import { Router, Request, Response } from 'express';
import * as memjs from 'memjs';
import * as request from 'request-promise';
import { resolve, reject } from 'bluebird';

const memcached = memjs.Client.create(process.env.MEMCACHIER_SERVERS);
const router: Router = Router();

router.get('/:username', (req: Request, res: Response) => {
    const { username } = req.params;

    res.type('application/json');
    fetchOrGetSubInfo(username, (subInfo => {
        subInfo.catch(err => {
            console.error(`Error fetching subInfo for ${username}: ${err}`)
            res.status(500);
            res.end();
        }).then(subInfo => {
            res.write(subInfo);
            res.end();
        })
    }));
});

const fetchOrGetSubInfo = (username: string, callback: (subInfo: Promise<string>) => any) => {
    memcached.get(username, (err, subinfo) => {
        if (subinfo != null) {
            console.log(`Cache hit for ${username}`);
            callback(resolve(subinfo.toString('utf8')));
        }
        else if (err == null) {
            console.log(`Cache miss for ${username}`);
            getSubInfo(username).then(subInfo => {
                memcached.set(username, subInfo, { expires: 3600 * 24 }, () => { });
                callback(resolve(subInfo));
            })
        } else {
            callback(reject("MemCached error"))
        }
    })
}

const getSubInfo = async (username: string): Promise<string> => {
    const commentsAPIURL = `https://www.reddit.com/user/${username}/comments.json?limit=100`;
    const APIresponse = JSON.parse(await request.get(commentsAPIURL));

    if (!APIresponse || !APIresponse['data'])
        return '{"status": "API error"}';

    let subs: { [key: string]: number } = {};

    APIresponse['data']['children'].map((c: any) => c.data).map((comment: any) => {
        const permalink: string = comment.permalink;
        const sub = permalink.match(/^\/r\/(.*?)\/.*/);

        if (sub != null) {
            if (subs[sub[1]] != undefined)
                subs[sub[1]] += comment.score;
            else
                subs[sub[1]] = comment.score;
        }
    });

    return JSON.stringify(subs);
}

export default router;