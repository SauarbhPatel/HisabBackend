const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "💸 Hisaab API",
            version: "1.0.0",
            description: "Hisaab — Expense Tracker & Freelance Manager API.",
            contact: { name: "Hisaab Dev" },
        },
        servers: [
            {
                url: "https://hisabbackend-qmty.onrender.com",
                description: "Live",
            },
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
                    description:
                        "Enter your JWT token (obtained from login/signup)",
                },
            },
            schemas: {
                StandardResponse: {
                    type: "object",
                    properties: {
                        response: {
                            type: "object",
                            properties: {
                                response_code: {
                                    type: "string",
                                    example: "200",
                                },
                                response_message: {
                                    type: "string",
                                    example: "Success",
                                },
                            },
                        },
                        data: { type: "object", nullable: true },
                    },
                },
            },
        },
        tags: [
            {
                name: "Auth",
                description:
                    "Authentication — Signup, Login, OTP, Password Reset",
            },
            { name: "Friends", description: "Friends & Personal Balances" },
            { name: "Groups", description: "Groups & Shared Expenses" },
            { name: "Expenses", description: "Personal Expense Tracking" },
            { name: "Projects", description: "Freelance Project Management" },
            { name: "Developers", description: "Developer / Team Management" },
            { name: "Clients", description: "Client / Company Management" },
            { name: "Reports", description: "Reports & Analytics" },
        ],
    },
    apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app) => {
    app.use(
        "/api/docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec, {
            customCss: ".swagger-ui .topbar { background: #1a7a5e; }",
            customSiteTitle: "💸 Hisaab API Docs",
            swaggerOptions: { persistAuthorization: true },
        }),
    );

    app.get("/api/docs.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });

    console.log(
        `📚 Swagger Docs: http://localhost:${process.env.PORT || 5000}/api/docs`,
    );
};

module.exports = setupSwagger;
