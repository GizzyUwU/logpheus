# Logpheus

Logpheus is a project built to take your FT devlogs and send them to your personal channel.

# Hosted Version

It has an already hosted version which is usable at @logpheus.

To make use of it, in a channel made by you run the command:

```
/logpheus-add
```

It should open up a model asking for your FT Project Id and FT API Key unless you don't own the channel then it will error. Once you enter the data it will send a successfully added notification and the bot will start poll every minute using your api key to see if any new devlog has been posted and if one has it will send a message in your channel like this:

![Example of a Devlog notification in a channel](/screenshots/devlog.png)

## Decided you don't want it posting anymore?

If you don't want it posting anymore just run

```
/logpheus-remove [project-id]
```

The project-id parameter isn't needed for it to run but if it is provided it will only stop polling for that project if no id is provided it will deleted the api key from the store preventing any polling from happening.

## Self Hosted Version

If you don't want to give your api key to me then self host it yourself! This project provides a Dockerfile and compose.yaml for you so you can easily self host it yourself with docker.

The environment variables needed for it to run are:

```env
APP_TOKEN= # String
BOT_TOKEN= # String
SIGNING_SECRET= # String
SOCKET_MODE= # Boolean
```

If you don't make use of Socket Mode the endpoints needed to set on the dashboard are

```
https://example.com/slack/events # For Slash Commands and Interactivity & Shortcuts
```

The bot also requires these OAUTH Bot Token Scopes:

```
channels:read
chat:write
chat:write_public
commands
group:read
groups:write
im:read
mpim:read
```

### Self Hosted - Slash Commands

Due to Slack also being annoying with bots self hosted instances have a different command prefix making use of this scheme to set the bot's prefix

```
bot-id-last-2-chars-bot-name-command
```

as an example of a command using this might be (this is from someone's self hosted instance used as example)

```
/89-logpheus_snowflake-stats
```

For a more detailed look of how it's generated here's the exact code

```ts
if (self.user_id === "U0A50Q9SYK1") {
  prefix = "devlpheus";
  console.log("[Logpheus] My prefix is", prefix);
} else if (self.user_id === "U0A5CFG4EAJ") {
  prefix = "logpheus";
  console.log("[Logpheus] My prefix is", prefix);
} else {
  if (!self.user || !self.user_id)
    throw new Error("No username or user id for prefix");
  prefix = self.user_id?.slice(-2).toLowerCase() + "-" + self.user;
  console.log("[Logpheus] My prefix is", prefix);
}
```

The current set out commands for the bot that need to be added manually when using webhook mode is
- (prefix)-add
- (prefix)-config
- (prefix)-remove
- (prefix)-stats