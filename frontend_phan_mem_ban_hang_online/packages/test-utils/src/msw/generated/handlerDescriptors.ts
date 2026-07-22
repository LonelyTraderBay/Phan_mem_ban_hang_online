// GENERATED — do not hand-edit. Source: contracts/openapi/*.yaml (via generate-msw-fixtures.mjs).
// Run 'node tooling/scripts/generate-msw-fixtures.mjs' to refresh.

export interface HandlerDescriptor {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  status: number;
  body: unknown;
  apiBaseUrl: string;
}

export const handlerDescriptors: HandlerDescriptor[] = [
  {
    "method": "post",
    "path": "/auth/refresh",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/auth/logout",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/auth/password/forgot",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/auth/password/reset",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/auth/switch-tenant",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/tenants/current",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/tenants/current",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/members",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/members/invitations",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/members/invitations/:invitation_id/resend",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/members/:member_id/activate",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/members/:member_id/suspend",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/members/:member_id/revoke",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/roles",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/roles",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/roles/:role_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "delete",
    "path": "/roles/:role_id",
    "status": 204,
    "body": null,
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/permissions",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "put",
    "path": "/members/:member_id/roles",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/sessions",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "delete",
    "path": "/sessions/:session_id",
    "status": 204,
    "body": null,
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/devices",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "delete",
    "path": "/devices/:device_id",
    "status": 204,
    "body": null,
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/audit-logs",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/customers",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/customers",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/customers/:customer_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/customers/:customer_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/customers/:customer_id/identities",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/customers/:customer_id/addresses",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/customers/:customer_id/addresses/:address_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/customers/:customer_id/tags",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "delete",
    "path": "/customers/:customer_id/tags/:tag_id",
    "status": 204,
    "body": null,
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/customers/:customer_id/notes",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/customers/merge-preview",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/customers/merge",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/categories",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/categories",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/categories/:category_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/categories/:category_id/archive",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/products",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/products",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/products/:product_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/products/:product_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/products/:product_id/archive",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/variants",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/products/:product_id/variants",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/variants/:variant_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/variants/:variant_id/archive",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/media/uploads",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/products/:product_id/media",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/imports/:job_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/imports/:job_id/preview",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "put",
    "path": "/imports/:job_id/mapping",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/imports/:job_id/errors",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/imports/:job_id/cancel",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/warehouses",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/warehouses",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/warehouses/:warehouse_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/inventory/balances",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/inventory/movements",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/inventory/adjustments",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/inventory/adjustments/:adjustment_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/inventory/reservations/:reservation_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/inventory/reservations/:reservation_id/release",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/inventory/reservations/:reservation_id/extend",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/inventory/reservations/:reservation_id/convert",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/inventory/reconciliation-jobs/:job_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/knowledge/sources",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/knowledge/sources",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/knowledge/sources/:source_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/knowledge/sources/:source_id/versions",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/knowledge/versions/:version_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/knowledge/versions/:version_id/submit-review",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/knowledge/versions/:version_id/approve",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/knowledge/versions/:version_id/archive",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/knowledge/versions/:version_id/ingestion",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/knowledge/search-test",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/channels/accounts",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/channels/:provider/connect",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/channels/:provider/oauth/callback",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/webhooks/:provider",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/channels/accounts/:account_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/channels/accounts/:account_id/disconnect",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/webhook-events",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/webhook-events/:event_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/outbound-messages/:message_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/conversations",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/conversations/:conversation_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/conversations/:conversation_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/conversations/:conversation_id/messages",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/assign",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/unassign",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/notes",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/resolve",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/reopen",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/escalate",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/human-takeover",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/release-takeover",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/conversations/:conversation_id/ai-suggestions",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/conversations/:conversation_id/ai-suggestions/:suggestion_id/approve",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/evaluate-response",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/test-message",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/ai/logs",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/ai/logs/:ai_log_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/ai/blocked-outputs",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/ai/prompt-versions",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/prompt-versions",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/ai/evaluation-runs/:run_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/prompt-versions/:prompt_version_id/approve",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/prompt-versions/:prompt_version_id/activate",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/prompt-versions/:prompt_version_id/rollback",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/disable",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/ai/enable",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/orders",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/orders/:order_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/orders/:order_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/recalculate",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/reserve",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/confirm",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/cancel",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/expire",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/orders/:order_id/history",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/orders/:order_id/payments",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/payments",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/payments/:payment_id/confirm",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/payments/:payment_id/refunds",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/shipments",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "patch",
    "path": "/shipments/:shipment_id",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/shipments/:shipment_id/mark-packed",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/shipments/:shipment_id/mark-shipped",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/shipments/:shipment_id/mark-delivered",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/orders/:order_id/returns",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/returns/:return_id/approve",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/returns/:return_id/receive",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/returns/:return_id/complete",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/dashboard/today",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/reports/revenue",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/reports/gross-profit",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/reports/sla",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/reports/ai-quality",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/billing/plan",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/billing/usage",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "post",
    "path": "/billing/subscription/manual-update",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/api"
  },
  {
    "method": "get",
    "path": "/super-admin/tenants",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "get",
    "path": "/super-admin/tenants/:tenant_id/health",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "post",
    "path": "/super-admin/tenants/:tenant_id/support-access",
    "status": 201,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "post",
    "path": "/super-admin/tenants/:tenant_id/feature-flags/:flag_key",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "post",
    "path": "/super-admin/tenants/:tenant_id/disable-ai",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "get",
    "path": "/super-admin/system-alerts",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "get",
    "path": "/super-admin/ai-health",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "get",
    "path": "/super-admin/channel-health",
    "status": 200,
    "body": {
      "data": {
        "id": "fixture_00000000-0000-0000-0000-000000000000",
        "version": 1,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  },
  {
    "method": "get",
    "path": "/super-admin/audit-logs",
    "status": 200,
    "body": {
      "data": [],
      "page_info": {
        "next_cursor": null,
        "has_more": false
      },
      "meta": {
        "request_id": "req_fixture"
      }
    },
    "apiBaseUrl": "/ops-api"
  }
];
