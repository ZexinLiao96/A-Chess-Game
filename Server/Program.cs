using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace GameServer
{
    public class Game
    {
        public string Id { get; set; }
        public string State { get; set; }
        public string Player1 { get; set; }
        public string Player2 { get; set; }
        public string Player1LastMove { get; set; }
        public string Player2LastMove { get; set; }
    }

    public class Server
    {
        private Socket server;
        private ConcurrentDictionary<string, string> players;
        private ConcurrentQueue<Game> waitingGames;
        private ConcurrentDictionary<string, Game> activeGames;
        private Random random;
        private int threadCounter = 0;

        public Server(string ip, int port)
        {
            var ipAddress = IPAddress.Parse(ip);
            server = new Socket(ipAddress.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
            players = new ConcurrentDictionary<string, string>();
            waitingGames = new ConcurrentQueue<Game>();
            activeGames = new ConcurrentDictionary<string, Game>();
            random = new Random();
        }

        public void Start()
        {
            server.Bind(new IPEndPoint(IPAddress.Parse("127.0.0.1"), 8080));
            server.Listen(10);  // 10 is the maximum length of the pending connections queue
            Console.WriteLine("listening at 127.0.0.1:8080");

            while (true)
            {
                var client = server.Accept();
                Console.WriteLine($"Connection established with {client.RemoteEndPoint}");
                var threadId = Interlocked.Increment(ref threadCounter);
                var thread = new Thread(() => HandleClient(client));
                thread.Name = "" + threadId;
                thread.Start();
            }
        }

        private void HandleClient(Socket client)
        {
            while (true)
            {
                var buffer = new byte[client.ReceiveBufferSize];
                var messageReceived = "";

                while (!messageReceived.Contains("\r\n"))
                {
                    var bytesRead = client.Receive(buffer);
                    messageReceived += Encoding.ASCII.GetString(buffer, 0, bytesRead);
                }

                var requestLine = messageReceived.Split("\r\n")[0];
                if (requestLine == "")
                {
                    var messageToSend = "HTTP/1.1 400 Empty Request\r\n\r\n";
                    var messageBytes = Encoding.ASCII.GetBytes(messageToSend);
                    client.Send(messageBytes);
                    continue;
                }

                string method;
                string endpoint;
                try
                {
                    method = requestLine.Split(" ")[0];
                    endpoint = requestLine.Split(" ")[1];
                }
                catch
                {
                    var messageToSend = "HTTP/1.1 400 Invalid Request\r\n\r\n";
                    var messageBytes = Encoding.ASCII.GetBytes(messageToSend);
                    client.Send(messageBytes);
                    continue;
                }

                if (method == "GET")
                {
                    if (endpoint.StartsWith("/register"))
                    {
                        RegisterPlayer(client);
                    }
                    else if (endpoint.StartsWith("/pairme"))
                    {
                        PairPlayer(client, endpoint);
                    }
                    else if (endpoint.StartsWith("/mymove"))
                    {
                        HandleMyMove(client, endpoint);
                    }
                    else if (endpoint.StartsWith("/theirmove"))
                    {
                        HandleTheirMove(client, endpoint);
                    }
                    else if (endpoint.StartsWith("/quit"))
                    {
                        Quit(client, endpoint);
                    }
                    else
                    {
                        var messageToSend = "HTTP/1.1 400 Invalid Endpoint\r\n\r\n";
                        var messageBytes = Encoding.ASCII.GetBytes(messageToSend);
                        client.Send(messageBytes);
                    }
                }
                else
                {
                    var messageToSend = "HTTP/1.1 400 Invalid Method\r\n\r\n";
                    var messageBytes = Encoding.ASCII.GetBytes(messageToSend);
                    client.Send(messageBytes);
                }
            }
        }

        private void RegisterPlayer(Socket client)
        {
            var username = GenerateUniqueUsername();
            players[username] = Thread.CurrentThread.Name;

            var responseBody = Encoding.ASCII.GetBytes(username);
            string responseHeader = $"HTTP/1.1 200 OK\r\nConnection: keep-alive\r\n" +
                $"Access-Control-Allow-Origin: *\r\n" +
                $"Access-Control-Allow-Methods: GET, POST\r\n" +
                $"Access-Control-Allow-Headers: Content-Type\r\n" +
                $"Content-Type: text/plain\r\n" +
                $"Content-Length: {responseBody.Length}\r\n\r\n";

            client.Send(Encoding.ASCII.GetBytes(responseHeader));
            client.Send(responseBody);

            Console.WriteLine($"Thread {Thread.CurrentThread.Name} sent response to {client.RemoteEndPoint} for /register");
        }

        private void PairPlayer(Socket client, string endpoint)
        {
            var username = endpoint.Split("=")[1];
            if (!players.ContainsKey(username))
            {
                var messageToSend = "HTTP/1.1 400 Bad Request\r\n\r\n";
                var messageBytes = Encoding.ASCII.GetBytes(messageToSend);
                client.Send(messageBytes);
                return;
            }

            Game game;

            foreach (Game activeGame in activeGames.Values)
            {
                if (activeGame.Player1 == username || activeGame.Player2 == username)
                {
                    game = new Game
                    {
                        Id = activeGame.Id,
                        State = "progress",
                        Player1 = activeGame.Player1,
                        Player2 = activeGame.Player2
                    };
                    SendGameRecord(client, game);
                    return;
                }
            }

            if (!waitingGames.TryDequeue(out game))
            {
                game = new Game
                {
                    Id = Guid.NewGuid().ToString(),
                    State = "wait",
                    Player1 = username
                };
                waitingGames.Enqueue(game);
            }
            else
            {
                if (username != game.Player1)
                {
                    game.State = "progress";
                    game.Player2 = username;
                    activeGames[game.Id] = game;
                }
                else
                {
                    waitingGames.Enqueue(game);
                }
            }

            SendGameRecord(client, game);
            Console.WriteLine($"Thread {Thread.CurrentThread.Name} sent response to {client.RemoteEndPoint} for {endpoint}");
        }

        private void HandleMyMove(Socket client, string endpoint)
        {
            // Extract parameters from endpoint
            var parameters = endpoint.Split("?")[1].Split("&");
            var username = parameters[0].Split("=")[1].Trim();
            var gameId = parameters[1].Split("=")[1].Trim();
            var move = parameters[2].Split("=")[1].Trim();

            string responseHeader;

            // Check if player and game exist
            if (!players.ContainsKey(username) || !activeGames.ContainsKey(gameId))
            {
                responseHeader = GenerateResponseHeader("400 Bad Request", 0);
            }
            else
            {
                var game = activeGames[gameId];
                if (game.Player1 != username && game.Player2 != username)
                {
                    // Player not in the game
                    responseHeader = GenerateResponseHeader("403 Forbidden", 0);
                }
                else if (game.State != "progress")
                {
                    // Game not in progress
                    responseHeader = GenerateResponseHeader("409 Conflict", 0);
                }
                else
                {
                    // Record the move in the game
                    if (game.Player1 == username)
                    {
                        game.Player1LastMove = move;
                    }
                    else
                    {
                        game.Player2LastMove = move;
                    }
                    responseHeader = GenerateResponseHeader("200 OK", 0);
                }
            }

            // Send the response to the client
            client.Send(Encoding.ASCII.GetBytes(responseHeader));
            Console.WriteLine($"Thread {Thread.CurrentThread.Name} sent response to {client.RemoteEndPoint} for {endpoint}");
        }

        private void HandleTheirMove(Socket client, string endpoint)
        {
            var parameters = endpoint.Split("?")[1].Split("&");
            var username = parameters[0].Split("=")[1];
            var gameId = parameters[1].Split("=")[1];

            string responseHeader;
            string responseBody = "";

            Game game = null;

            if (!players.ContainsKey(username))
            {
                responseHeader = GenerateResponseHeader("400 Bad Request", 0);
            }
            else if (!activeGames.ContainsKey(gameId))
            {
                responseBody = "You Win";
                responseHeader = GenerateResponseHeader("200 OK", responseBody.Length);
            }
            else
            {
                game = activeGames[gameId];
                if (game.Player1 != username && game.Player2 != username)
                {
                    responseHeader = GenerateResponseHeader("403 Forbidden", 0);
                }
                else if (game.State != "progress")
                {
                    responseHeader = GenerateResponseHeader("409 Conflict", 0);
                }
                else
                {
                    // Check if either player hasn't moved yet.
                    if ((game.Player1 == username && game.Player2LastMove == null) ||
                        (game.Player2 == username && game.Player1LastMove == null))
                    {
                        // In this case, just set responseBody to an empty string.
                        responseBody = "";
                    }
                    else
                    {
                        // Otherwise, return the opponent's last move.
                        responseBody = game.Player1 == username ? game.Player2LastMove : game.Player1LastMove;
                    }

                    responseHeader = GenerateResponseHeader("200 OK", responseBody.Length);
                }
            }

            client.Send(Encoding.ASCII.GetBytes(responseHeader));
            client.Send(Encoding.ASCII.GetBytes(responseBody));
            Console.WriteLine($"Thread {Thread.CurrentThread.Name} sent response to {client.RemoteEndPoint} for {endpoint}");

            if (game != null)
            {
                if (game.Player1 == username)
                {
                    game.Player1LastMove = null;
                }
                else
                {
                    game.Player2LastMove = null;
                }
            }
        }

        private void Quit(Socket client, string endpoint)
        {
            var parameters = endpoint.Split("?")[1].Split("&");
            var username = parameters[0].Split("=")[1];
            var gameId = parameters[1].Split("=")[1];

            string responseHeader;
            if (!players.ContainsKey(username) || !activeGames.ContainsKey(gameId))
            {
                responseHeader = GenerateResponseHeader("400 Bad Request", 0);
            }
            else
            {
                var game = activeGames[gameId];
                if (game.Player1 != username && game.Player2 != username)
                {
                    responseHeader = GenerateResponseHeader("403 Forbidden", 0);
                }
                else
                {
                    if (activeGames.TryRemove(gameId, out _))
                    {
                        responseHeader = GenerateResponseHeader("200 OK", 0);
                        Console.WriteLine($"Thread {Thread.CurrentThread.Name} closing connection with {client.RemoteEndPoint} and terminating");
                    }
                    else
                    {
                        responseHeader = GenerateResponseHeader("500 Internal Server Error", 0);
                    }
                }
            }

            client.Send(Encoding.ASCII.GetBytes(responseHeader));
        }

        private string GenerateUniqueUsername()
        {
            string username;
            do
            {
                var stringBuilder = new StringBuilder();

                for (int i = 0; i < 3; i++)
                {
                    char letter = (char)('A' + random.Next(0, 26)); // generate a random letter
                    stringBuilder.Append(letter);
                }

                for (int i = 0; i < 3; i++)
                {
                    char number = (char)('0' + random.Next(0, 10)); // generate a random digit
                    stringBuilder.Append(number);
                }

                username = stringBuilder.ToString();
            }
            while (!players.TryAdd(username, Thread.CurrentThread.Name)); // keep generating until we get a unique username

            return username;
        }

        private void SendGameRecord(Socket client, Game game)
        {
            var gameData = new
            {
                gameID = game.Id,
                gameState = game.State,
                player1 = game.Player1,
                player2 = game.Player2,
                player1LastMove = game.Player1LastMove,
                player2LastMove = game.Player2LastMove
            };
            var gameDataJson = JsonSerializer.Serialize(gameData);

            var respondBody = Encoding.ASCII.GetBytes(gameDataJson);
            string respondHeader = $"HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\n" +
                $"Access-Control-Allow-Methods: GET, POST\r\n" +
                $"Access-Control-Allow-Headers: Content-Type\r\n" +
                $"Content-Type: application/json\r\n" +
                $"Content-Length: {respondBody.Length}\r\n\r\n";
            client.Send(Encoding.ASCII.GetBytes(respondHeader));
            client.Send(respondBody);
        }

        private string GenerateResponseHeader(string status, int length)
        {
            return $"HTTP/1.1 {status}\r\n" +
                   $"Access-Control-Allow-Origin: *\r\n" +
                   $"Access-Control-Allow-Methods: GET, POST\r\n" +
                   $"Access-Control-Allow-Headers: Content-Type\r\n" +
                   $"Content-Length: {length}\r\n\r\n";
        }
    }

    class Program
    {
        static void Main(string[] args)
        {
            var server = new Server("127.0.0.1", 8080);
            server.Start();
        }
    }
}
