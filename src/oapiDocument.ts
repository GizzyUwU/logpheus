import type { ZodOpenApiObject } from "zod-openapi";
import { z } from "zod";
import {
  GoalsError,
  GoalsPutPostDelete,
  GoalsResponse,
} from "./apiSchema/goals";

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
  },
} as ZodOpenApiObject;

export default openapiSpecification;
