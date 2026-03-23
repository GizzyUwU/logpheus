import type { ZodOpenApiObject } from "zod-openapi";
import { z } from "zod";
import {
  GoalsError,
  GoalsPutPostDelete,
  GoalsResponse,
} from "./apiSchema/goals";
import { MultiplierError, MultiplierPostGet } from "./apiSchema/multiplier";

const openapiSpecification = {
  openapi: "3.1.1",
  info: {
    title: "Logpheus",
    version: "1.0.0",
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Flavortown Authentication",
      },
    },
  },
  paths: {
    "/api/v1/goals": {
      post: {
        tags: ["Goals"],
        requestParams: {
          header: z.object({
            Authorization: z.string().meta({
              description: "JWT token in format: Bearer <token>",
              example: "Bearer ft_sk_",
              param: {
                required: true,
              },
            }),
          }),
        },
        requestBody: {
          content: {
            "application/json": {
              schema: GoalsPutPostDelete,
            },
          },
        },
        responses: {
          "200": {
            description: "200 OK",
            content: {
              "application/json": {
                schema: GoalsResponse,
              },
            },
          },
          "401": {
            description: "401 Unauthorised",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "408": {
            description: "408 Request Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "429": {
            description: "429 Too Many Requests",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "500": {
            description: "500 Internal Server Error",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "502": {
            description: "502 Bad Gateway",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "503": {
            description: "503 Service Unavailable",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "504": {
            description: "504 Gateway Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
        },
      },
      put: {
        tags: ["Goals"],
        requestParams: {
          header: z.object({
            Authorization: z.string().meta({
              description: "JWT token in format: Bearer <token>",
              example: "Bearer ft_sk_",
              param: {
                required: true,
              },
            }),
          }),
        },
        requestBody: {
          content: {
            "application/json": {
              schema: GoalsPutPostDelete,
            },
          },
        },
        responses: {
          "200": {
            description: "200 OK",
            content: {
              "application/json": {
                schema: GoalsResponse,
              },
            },
          },
          "401": {
            description: "401 Unauthorised",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "408": {
            description: "408 Request Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "429": {
            description: "429 Too Many Requests",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "500": {
            description: "500 Internal Server Error",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "502": {
            description: "502 Bad Gateway",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "503": {
            description: "503 Service Unavailable",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "504": {
            description: "504 Gateway Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
        },
      },
      delete: {
        tags: ["Goals"],
        requestParams: {
          header: z.object({
            Authorization: z.string().meta({
              description: "JWT token in format: Bearer <token>",
              example: "Bearer ft_sk_",
              param: {
                required: true,
              },
            }),
          }),
        },
        requestBody: {
          content: {
            "application/json": {
              schema: GoalsPutPostDelete,
            },
          },
        },
        responses: {
          "200": {
            description: "200 OK",
            content: {
              "application/json": {
                schema: GoalsResponse,
              },
            },
          },
          "401": {
            description: "401 Unauthorised",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "408": {
            description: "408 Request Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "429": {
            description: "429 Too Many Requests",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "500": {
            description: "500 Internal Server Error",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "502": {
            description: "502 Bad Gateway",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "503": {
            description: "503 Service Unavailable",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "504": {
            description: "504 Gateway Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
        },
      },
      get: {
        tags: ["Goals"],
        requestParams: {
          header: z.object({
            Authorization: z.string().meta({
              description: "JWT token in format: Bearer <token>",
              example: "Bearer ft_sk_",
              param: {
                required: true,
              },
            }),
          }),
        },
        responses: {
          "200": {
            description: "200 OK",
            content: {
              "application/json": {
                schema: GoalsResponse,
              },
            },
          },
          "401": {
            description: "401 Unauthorised",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "408": {
            description: "408 Request Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "429": {
            description: "429 Too Many Requests",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "500": {
            description: "500 Internal Server Error",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "502": {
            description: "502 Bad Gateway",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "503": {
            description: "503 Service Unavailable",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
          "504": {
            description: "504 Gateway Timeout",
            content: {
              "application/json": {
                schema: GoalsError,
              },
            },
          },
        },
      },
    },
    "/api/v1/{projectId}/multiplier": {
      parameters: [
        {
          in: "path",
          name: "projectId",
          description: "The project's identifier",
        },
      ],
      post: {
        tags: ["Multiplier"],
        requestParams: {
          header: z.object({
            Authorization: z.string().meta({
              description: "JWT token in format: Bearer <token>",
              example: "Bearer ft_sk_",
              param: {
                required: true,
              },
            }),
          }),
        },
        requestBody: {
          content: {
            "application/json": {
              schema: MultiplierPostGet,
            },
          },
        },
        responses: {
          "200": {
            description: "200 OK",
            content: {
              "application/json": {
                schema: MultiplierPostGet,
              },
            },
          },
          "401": {
            description: "401 Unauthorised",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "408": {
            description: "408 Request Timeout",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "429": {
            description: "429 Too Many Requests",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "500": {
            description: "500 Internal Server Error",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "502": {
            description: "502 Bad Gateway",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "503": {
            description: "503 Service Unavailable",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "504": {
            description: "504 Gateway Timeout",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
        },
      },
      get: {
        tags: ["Multiplier"],
        requestParams: {
          header: z.object({
            Authorization: z.string().meta({
              description: "JWT token in format: Bearer <token>",
              example: "Bearer ft_sk_",
              param: {
                required: true,
              },
            }),
          }),
        },
        responses: {
          "200": {
            description: "200 OK",
            content: {
              "application/json": {
                schema: MultiplierPostGet,
              },
            },
          },
          "401": {
            description: "401 Unauthorised",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "408": {
            description: "408 Request Timeout",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "429": {
            description: "429 Too Many Requests",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "500": {
            description: "500 Internal Server Error",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "502": {
            description: "502 Bad Gateway",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "503": {
            description: "503 Service Unavailable",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
          "504": {
            description: "504 Gateway Timeout",
            content: {
              "application/json": {
                schema: MultiplierError,
              },
            },
          },
        },
      },
    },
  },
} as ZodOpenApiObject;

export default openapiSpecification;
