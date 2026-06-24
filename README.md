# Logpheus

![Logpheus Hackatime Tracked](https://hackatime.hackclub.com/api/v1/badge/U08D3AY7BG8/GizzyUwU/logpheus)

Logpheus is a bot built before Flavorpheus (the offical Flavortown bot) that serves the purpose of being a generic YSWS bot to interact with YSWS's and other supported Hack Club services it supports from the slack providing QoL feature's such as checking the shop's YSWS's, looking at project's of YSWS's, getting notified of public transactions on HCB made from your HCB Id, getting notified of new mail or changes to existing mail on Theseus (HC Mail) and more.

# Hosted Version

It has an already hosted version which is usable at @logpheus on the Hack Club slack.

To make use of it, run the following command below to register

```
/logpheus register
```

you can then run the help command below to find out some of the commands!

```
/logpheus help
```

Some of the features I personally use which you may want to check out is the HCB Transacation Job and the ADTC (Automated Devlog To Channel) Job, to use the HCB Job just run the command below and follow the instructions to add your HCB Id

```
/logpheus config
```

The ADTC job requires you to sign up to a supported YSWS so run to find all YSWS's supported by the bot

```
/logpheus ysws
```

then sign up for a YSWS with the following command
```
/logpheus-(ysws) register
```

so that you are now registered to that YSWS and can use all the commands the bot supports for the YSWS and run the following command to subscribe a project's devlogs to the ADTC job which will use the channel it is run in (if channel id does not yet exist for you for pre-existing channel id set it will use that changable via ``/logpheus move`` or ``/logpheus config``)

```
/logpheus-(ysws) add
```

### Not a personal channel owner?

Not all Logpheus's job's require a personal channel such as the theseus (HC Mail) job and HCB Transaction job can be subscribed to through the generic config command to work inside dms, dming you of any new or changes that happen in them. You can also use the YSWS specific commands without having to setup a channel to!

## Decided you don't want it posting anymore?

If you don't want it posting anymore just run

```
/logpheus-(ysws) remove [project-id]
```

The project-id parameter isn't needed for it to run but if it is provided it will only stop polling for that project.

## Self Hosted Version

If you don't want to give your api key to me then self host it yourself! This project provides a Dockerfile and compose.yaml for you so you can easily self host it yourself with docker.

The environment variables needed for it to run are:

```env
APP_TOKEN= # Optional String
BOT_TOKEN= # String
SIGNING_SECRET= # String
SOCKET_MODE= # Boolean
PGLITE= # Optional Boolean
DB_URL= # Optional String (Missing = Use PGLite)
KEEP_PORT_USAGE= # Optional Boolean
VIKUNJA_BUG_LABEL_ID= # Optional Integer
VIKUNJA_FEATURE_LABEL_ID= # Optional Integer
VIKUNJA_BUG_PROJECT_ID= # Optional Integer
VIKUNJA_FEATURE_PROJECT_ID= # Optional Integer
VIKUNJA_TOKEN= # Optional String
VIKUNJA_URL= # Optional String
BUGSINK_URL= # Optional String
BUGSINK_TOKEN= # Optional String
BUGSINK_PROJECT_ID= # Optional Integer
```

If you don't make use of Socket Mode the endpoints needed to set on the dashboard are

```
https://example.com/slack/events # For Slash Commands and Interactivity & Shortcuts
```

The bot also requires these OAUTH Bot Token Scopes:

```
channels:join
channels:read
chat:write
chat:write_public
commands
group:read
groups:write
im:history
im:read
mprim:history
mpim:read
```

All this configuration could be easily done to by using (modifying slightly) the provided manifest.json

### Self Hosted - Docker

If you use docker I recommend using alpine linux on host since you get the benefit of apk cache in the Dockerfile but if you don't want to use it then you can use the MP.Dockerfile/mp-compose.yaml which removes the flag for APK cache.

It also makes use of bunjs cache so on the user docker is running under you should have bunjs installed and have used bun install before (just installing bunjs doesn't make that folder) or atleast have .bun/install/cache in the users home folder so both Dockerfile's work and the deploy should work sucessfully. You may not need to do this I haven't tested if it would build the dockerfile if these don't exist so I just recommend you do this to ensure it does work. I use coolify which uses root so I installed bunjs on root and just ran bun install on a random project to get the .bun/install/cache to generate.

MP in MP.Dockerfile and mp-compose.yaml stands for Multi Platform

### Self Hosted - Slash Commands

Due to Slack also being annoying with bots self hosted instances have a different command prefix making use of this scheme to set the bot's prefix

```
bot-id-last-2-chars-bot-name-command
```

as an example of a command using this might be (this is from someone's self hosted instance used as example)

```
/89-logpheus_snowflake stats
```

For a more detailed look of how it's generated here's the exact code

```ts
const self = await app.client.auth.test();
if (self.user_id === "U0AF4V5V04V") {
  prefix = "devpheus";
} else if (self.user_id === "U0AFE7QF849") {
  prefix = "logpheus";
} else {
  if (!self.user || !self.user_id)
    throw new Error("No username or user id for prefix");
  prefix = self.user_id?.slice(-2).toLowerCase() + "-" + self.user;
}
logger.info(
  "My prefix is",
  Bun.color("darkseagreen", "ansi") + prefix + "\x1b[0m",
);
```