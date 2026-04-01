const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "💸 Hisaab API",
      version: "1.0.0",
      description:
        "Hisaab — Expense Tracker & Freelance Manager API. All responses use HTTP 200 with `response_code` inside the body.",
      contact: {
        name: "Hisaab Dev",
      },
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Local Development Server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT token (obtained from login/signup)",
        },
      },
      schemas: {
        StandardResponse: {
          type: "object",
          properties: {
            response: {
              type: "object",
              properties: {
                response_code: { type: "string", example: "200" },
                response_message: { type: "string", example: "Success" },
              },
            },
            data: {
              type: "object",
              nullable: true,
            },
          },
        },
        User: {
          type: "object",
          properties: {
            _id: { type: "string", example: "64a1b2c3d4e5f6a7b8c9d0e1" },
            fullName: { type: "string", example: "Rahul Kumar" },
            phone: { type: "string", example: "+919876543210" },
            email: { type: "string", example: "rahul@gmail.com" },
            avatar: { type: "string", example: "😎" },
            avatarColor: { type: "string", example: "#1a7a5e" },
            useCase: {
              type: "string",
              enum: ["split", "freelance", "both"],
              example: "both",
            },
            isVerified: { type: "boolean", example: false },
            createdAt: { type: "string", example: "2026-01-15T10:30:00.000Z" },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Authentication — Signup, Login, OTP, Password Reset" },
      { name: "Friends", description: "Friends & Personal Balances" },
      { name: "Groups", description: "Groups & Shared Expenses" },
      { name: "Expenses", description: "Personal Expense Tracking" },
      { name: "Projects", description: "Freelance Project Management" },
      { name: "Developers", description: "Developer / Team Management" },
      { name: "Clients", description: "Client Management" },
      { name: "Reports", description: "Reports & Analytics" },
    ],
  },
  apis: ["./src/routes/*.js"], // Reads JSDoc from all route files
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app) => {
  // Swagger UI
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: `
        .swagger-ui .topbar { background: #1a7a5e; }
        .swagger-ui .topbar-wrapper img { content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 40'%3E%3Ctext y='30' font-size='24' fill='white'%3E💸 Hisaab%3C/text%3E%3C/svg%3E"); width: 120px; }
        .swagger-ui .info .title { color: #1a7a5e; }
      `,
      customSiteTitle: "💸 Hisaab API Docs",
      swaggerOptions: {
        persistAuthorization: true, // Keep JWT token across page reloads
      },
    })
  );

  // Raw JSON spec endpoint
  app.get("/api/docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  console.log(`📚 Swagger Docs: http://localhost:${process.env.PORT || 5000}/api/docs`);
};

module.exports = setupSwagger;
