const { ApolloServer } = require("@apollo/server");
const { createServer } = require("http");
const { expressMiddleware } = require("@apollo/server/express4");
const {
  ApolloServerPluginDrainHttpServer,
} = require("@apollo/server/plugin/drainHttpServer");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const bodyParser = require("body-parser");
const express = require("express");
const { WebSocketServer } = require("ws");
const { useServer } = require("graphql-ws/lib/use/ws");
const { PubSub } = require("graphql-subscriptions");

const port = 3000;

const blogs_update = "OPERATION_FINISHED";

const blogs = [];

const typeDefs = `
    type Blog {
        id: ID!
        content: String!
        author: String!
    }

    type Query {
        getBlogs: [Blog!]
    }

    type Mutation {
        addNewBlog(content: String!, author: String!): Blog!
    }

    type Subscription {
        newBlog: Blog!
    }
`;

const pubSub = new PubSub();

const publishNewBlogAdded = (content, author, id) => {
  pubSub.publish(blogs_update, {
    newBlog: { content, author, id },
  });
};

const resolvers = {
  Mutation: {
    addNewBlog(_, { content, author }) {
      const blog = {
        id: blogs.length + 1,
        content,
        author,
      };
      blogs.push(blog);
      publishNewBlogAdded(content, author, blog.id);
      return blog;
    },
  },
  Query: {
    getBlogs() {
      return blogs;
    },
  },
  Subscription: {
    newBlog: {
      subscribe: () => pubSub.asyncIterator([blogs_update]),
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = createServer(app);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

const wsServerCleanup = useServer({ schema }, wsServer);

const apolloServer = new ApolloServer({
  schema,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),

    // Proper shutdown for the WebSocket server.
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await wsServerCleanup.dispose();
          },
        };
      },
    },
  ],
});

(async function () {
  await apolloServer.start();
  app.use("/graphql", bodyParser.json(), expressMiddleware(apolloServer));
})();

httpServer.listen(port, () => {
  console.log(`🚀 Query endpoint ready at http://localhost:${port}/graphql`);
  console.log(
    `🚀 Subscription endpoint ready at ws://localhost:${port}/graphql`
  );
});
