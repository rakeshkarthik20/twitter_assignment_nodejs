const express = require("express");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    SELECT 
      * 
    FROM 
      user 
    WHERE 
      username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
     INSERT INTO
      user (username, name, password, gender)
     VALUES
      (
       '${username}',
       '${name}',
       '${hashedPassword}',
       '${gender}' 
      );`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT 
      * 
    FROM 
      user 
    WHERE 
      username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, dbUser.password);
    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  //   console.log(authHeader);
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
  }

  if (authHeader !== undefined) {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowerIdQuery = `select following_user_id from follower where follower_user_id='${userId.user_id}';`;
  const followerIds = await db.all(getFollowerIdQuery);

  const eachFollower = followerIds.map((each) => {
    return each.following_user_id;
  });

  const finalQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime 
      from user inner join tweet 
      on user.user_id= tweet.user_id where user.user_id in (${eachFollower})
       order by tweet.date_time desc limit 4 ;
  `;
  const dbResponse = await db.all(finalQuery);
  response.send(dbResponse);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowerIdQuery = `select following_user_id from follower where follower_user_id='${userId.user_id}';`;
  const followerIds = await db.all(getFollowerIdQuery);
  //   console.log(followerIds);
  const eachFollower = followerIds.map((each) => {
    return each.following_user_id;
  });

  const finalQuery = `select name from user where user.user_id in (${eachFollower});
    `;
  const dbResponse = await db.all(finalQuery);
  response.send(dbResponse);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowerIdQuery = `select follower_user_id from follower where following_user_id='${userId.user_id}';`;
  const followerIds = await db.all(getFollowerIdQuery);
  //   console.log(followerIds);
  const eachFollower = followerIds.map((each) => {
    return each.follower_user_id;
  });

  const finalQuery = `select name from user where user.user_id in (${eachFollower});
    `;
  const dbResponse = await db.all(finalQuery);
  response.send(dbResponse);
});

const convertor = (likesResponse, repliesResponse, tweetResponse) => {
  return {
    tweet: tweetResponse.tweet,
    likes: likesResponse.likes,
    replies: repliesResponse.replies,
    dateTime: tweetResponse.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowerIdQuery = `select following_user_id from follower where follower_user_id='${userId.user_id}';`;
  const followerIds = await db.all(getFollowerIdQuery);
  //   console.log(followerIds);
  const eachFollower = followerIds.map((each) => {
    return each.following_user_id;
  });

  const finalQuery = `select tweet_id from tweet where user_id in (${eachFollower});`;
  const dbResponse = await db.all(finalQuery);
  //   response.send(dbResponse);
  const followingTweetIds = dbResponse.map((eachId) => {
    return eachId.tweet_id;
  });
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likesQuery = `select count(user_id) as likes from like where tweet_id = '${tweetId}';`;
    const likesResponse = await db.get(likesQuery);
    const repliesQuery = `select count(user_id) as replies from reply where tweet_id = '${tweetId}';`;
    const repliesResponse = await db.get(repliesQuery);
    const tweetQuery = `select tweet, date_time from tweet where tweet_id = '${tweetId}';`;
    const tweetResponse = await db.get(tweetQuery);
    response.send(convertor(likesResponse, repliesResponse, tweetResponse));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

const converter2 = (getTweetLikedUser) => {
  return {
    likes: getTweetLikedUser,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const userId = await db.get(getUserIdQuery);
    const getFollowerIdQuery = `select following_user_id from follower where follower_user_id='${userId.user_id}';`;
    const followerIds = await db.all(getFollowerIdQuery);
    //   console.log(followerIds);
    const eachFollower = followerIds.map((each) => {
      return each.following_user_id;
    });

    const finalQuery = `select tweet_id from tweet where user_id in (${eachFollower});`;
    const dbResponse = await db.all(finalQuery);
    //   response.send(dbResponse);
    const followingTweetIds = dbResponse.map((eachId) => {
      return eachId.tweet_id;
    });
    if (followingTweetIds.includes(parseInt(tweetId))) {
      const userLikeQuery = `select user.username as likes from user inner join like
       on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
      const userResponse = await db.all(userLikeQuery);
      const getTweetLikedUser = userResponse.map((each) => {
        return each.likes;
      });
      response.send(converter2(getTweetLikedUser));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

const converter3 = (getTweetLikedUser) => {
  return {
    replies: getTweetLikedUser,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const userId = await db.get(getUserIdQuery);
    const getFollowerIdQuery = `select following_user_id from follower where follower_user_id='${userId.user_id}';`;
    const followerIds = await db.all(getFollowerIdQuery);
    //   console.log(followerIds);
    const eachFollower = followerIds.map((each) => {
      return each.following_user_id;
    });

    const finalQuery = `select tweet_id from tweet where user_id in (${eachFollower});`;
    const dbResponse = await db.all(finalQuery);
    //   response.send(dbResponse);
    const followingTweetIds = dbResponse.map((eachId) => {
      return eachId.tweet_id;
    });
    if (followingTweetIds.includes(parseInt(tweetId))) {
      const userLikeQuery = `select user.name as name, reply.reply as reply from user inner join reply
       on user.user_id=reply.user_id where reply.tweet_id=${tweetId};`;
      const userResponse = await db.all(userLikeQuery);
      const getTweetLikedUser = userResponse.map((each) => {
        return each;
      });
      response.send(converter3(getTweetLikedUser));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const userId = await db.get(getUserIdQuery);

  const finalQuery = `
    SELECT tweet_id, tweet, date_time AS dateTime 
    FROM tweet 
    WHERE user_id = ${userId.user_id}
    ORDER BY date_time DESC;
  `;

  const dbResponse = await db.all(list(finalQuery));
  response.send(dbResponse);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const { tweet } = request.body;
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

  const responseResult = await db.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

//api 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id='${tweetId}';`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
