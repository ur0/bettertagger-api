import { Router, Request, Response } from "express";
import * as memjs from "memjs";
import * as request from "request-promise";
import { resolve, reject } from "bluebird";

const memcached = memjs.Client.create(process.env.MEMCACHIER_SERVERS);
const router: Router = Router();

router.get("/:username", (req: Request, res: Response) => {
  const { username } = req.params;

  res.type("application/json");
  getScore(username, scoreInfo => {
    scoreInfo
      .catch(err => {
        console.error(`Error fetching subInfo for ${username}: ${err}`);
        res.status(500);
        res.end();
      })
      .then(subInfo => {
        res.write(JSON.stringify(subInfo));
        res.end();
      });
  });
});

router.post("/", (req: Request, res: Response) => {
  const dupeUsers: [string] = req.body;
  const usernames = dupeUsers.filter((x, i, a) => a.indexOf(x) == i);

  let scores: { [key: string]: { [key: string]: number } } = {};
  res.type("application/json");

  usernames.forEach(username => {
    getScore(username, scoreInfo => {
      scoreInfo
        .catch(err => {
          console.error(`Error fetching subInfo for ${username}: ${err}`);
        })
        .then(scoreInfo => {
          scores[username] = scoreInfo;
          if (Object.keys(scores).length == usernames.length) {
            res.write(JSON.stringify(scores));
            res.end();
          }
        });
    });
  });
});

const getScore = (
  username: string,
  callback: (scoreInfo: Promise<{ [key: string]: number }>) => any
) => {
  memcached.get(username, (err, scoreInfo) => {
    if (scoreInfo != null) {
      console.log(`Cache hit for ${username}`);
      callback(resolve(JSON.parse(scoreInfo.toString("utf8"))));
    } else if (err == null) {
      console.log(`Cache miss for ${username}`);
      getScoreFromReddit(username)
        .then(scoreInfo => {
          let info = JSON.stringify(scoreInfo);
          memcached.set(username, info, { expires: 3600 * 24 }, () => {});
          callback(resolve(scoreInfo));
        })
        .catch(e => {
          callback(reject(e));
        });
    } else {
      callback(reject("MemCached error"));
    }
  });
};

const getScoreFromReddit = async (
  username: string
): Promise<{ [key: string]: number }> => {
  const commentsAPIURL = `https://www.reddit.com/user/${username}/comments.json?limit=100`;
  const APIresponse = JSON.parse(await request.get(commentsAPIURL));

  if (!APIresponse || !APIresponse["data"])
    return reject('{"status": "API error"}');

  let subs: { [key: string]: number } = {};

  APIresponse["data"]["children"]
    .map((c: any) => c.data)
    .map((comment: any) => {
      const permalink: string = comment.permalink;
      const sub = permalink.match(/^\/r\/(.*?)\/.*/);

      if (sub != null) {
        if (subs[sub[1]] != undefined) subs[sub[1]] += comment.score;
        else subs[sub[1]] = comment.score;
      }
    });

  return subs;
};

export default router;
