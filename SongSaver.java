import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;

/**
 * Minimal local HTTP server so Bible Presenter can write to song_content.js.
 *
 * Run from C:\Git\Bible_Presenter:
 *   javac SongSaver.java
 *   java SongSaver
 *
 * Listens on http://localhost:7777
 *   POST /save    — body is the full file content; writes to song_content.js
 *   POST /append  — body is JSON {id, title, artist, content}; appends a single song entry
 *   GET  /ping    — returns "OK" (health-check)
 */
public class SongSaver {

    static final int    PORT = 7777;
    static final String FILE = "song_content.js";

    public static void main(String[] args) throws Exception {
        String filePath = (args.length > 0) ? args[0] : FILE;

        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", PORT), 10);

        // Full-rewrite save
        server.createContext("/save", exchange -> {
            addCors(exchange);
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }
            if ("POST".equals(exchange.getRequestMethod())) {
                try {
                    byte[] body = readAll(exchange.getRequestBody());
                    Files.write(Paths.get(filePath), body);
                    respond(exchange, 200, "OK");
                    System.out.println("[SongSaver] Wrote " + body.length + " bytes -> " + filePath);
                } catch (Exception e) {
                    respond(exchange, 500, "ERROR: " + e.getMessage());
                    System.err.println("[SongSaver] Write failed: " + e.getMessage());
                }
            } else {
                respond(exchange, 405, "Method Not Allowed");
            }
        });

        // Append a single song entry to song_content.js
        server.createContext("/append", exchange -> {
            addCors(exchange);
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }
            if ("POST".equals(exchange.getRequestMethod())) {
                try {
                    String body = new String(readAll(exchange.getRequestBody()), StandardCharsets.UTF_8);
                    int id          = getJsonInt(body, "id");
                    String title    = getJsonString(body, "title");
                    String artist   = getJsonString(body, "artist");
                    String content  = getJsonString(body, "content");

                    String entry = "\n\n  " + id + ": {\n"
                                 + "    title: `" + escapeTemplate(title) + "`,\n"
                                 + "    artist: \"" + escapeJsonString(artist) + "\",\n"
                                 + "    content: `" + escapeTemplate(content) + "`\n"
                                 + "  },";

                    Path path = Paths.get(filePath);
                    String existing = new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
                    int closeIdx = existing.lastIndexOf("};");
                    if (closeIdx < 0) {
                        respond(exchange, 500, "ERROR: Could not find closing }; in " + filePath);
                        return;
                    }
                    String updated = existing.substring(0, closeIdx) + entry + "\n\n};\n";
                    Files.write(path, updated.getBytes(StandardCharsets.UTF_8));
                    respond(exchange, 200, "OK");
                    System.out.println("[SongSaver] Appended song #" + id + " -> " + filePath);
                } catch (Exception e) {
                    respond(exchange, 500, "ERROR: " + e.getMessage());
                    System.err.println("[SongSaver] Append failed: " + e.getMessage());
                }
            } else {
                respond(exchange, 405, "Method Not Allowed");
            }
        });

        // Health-check endpoint
        server.createContext("/ping", exchange -> {
            addCors(exchange);
            respond(exchange, 200, "OK");
        });

        server.start();
        System.out.println("========================================");
        System.out.println("  SongSaver running on port " + PORT);
        System.out.println("  Writing to: " + Paths.get(filePath).toAbsolutePath());
        System.out.println("  Keep this window open while using the app.");
        System.out.println("  Press Ctrl+C to stop.");
        System.out.println("========================================");
    }

    static byte[] readAll(InputStream is) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
        return out.toByteArray();
    }

    static void respond(HttpExchange ex, int code, String body) throws IOException {
        byte[] bytes = body.getBytes("UTF-8");
        ex.sendResponseHeaders(code, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    static void addCors(HttpExchange ex) {
        ex.getResponseHeaders().add("Access-Control-Allow-Origin",  "*");
        ex.getResponseHeaders().add("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        ex.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");
    }

    // ── Minimal JSON helpers (no external libs needed) ──

    static String getJsonString(String json, String key) {
        // Finds "key":"value" allowing for escaped chars
        String needle = "\"" + key + "\"";
        int ki = json.indexOf(needle);
        if (ki < 0) return "";
        int colon = json.indexOf(':', ki + needle.length());
        if (colon < 0) return "";
        // Skip whitespace after colon
        int si = colon + 1;
        while (si < json.length() && json.charAt(si) == ' ') si++;
        if (si >= json.length() || json.charAt(si) != '"') return "";
        si++; // skip opening quote
        StringBuilder sb = new StringBuilder();
        for (int i = si; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                char next = json.charAt(i + 1);
                if (next == '"') { sb.append('"'); i++; }
                else if (next == '\\') { sb.append('\\'); i++; }
                else if (next == 'n') { sb.append('\n'); i++; }
                else if (next == 'r') { sb.append('\r'); i++; }
                else if (next == 't') { sb.append('\t'); i++; }
                else { sb.append(c); }
            } else if (c == '"') {
                break;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    static int getJsonInt(String json, String key) {
        String needle = "\"" + key + "\"";
        int ki = json.indexOf(needle);
        if (ki < 0) return 0;
        int colon = json.indexOf(':', ki + needle.length());
        if (colon < 0) return 0;
        int si = colon + 1;
        while (si < json.length() && json.charAt(si) == ' ') si++;
        StringBuilder sb = new StringBuilder();
        for (int i = si; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c >= '0' && c <= '9') sb.append(c);
            else if (sb.length() > 0) break;
        }
        return sb.length() > 0 ? Integer.parseInt(sb.toString()) : 0;
    }

    static String escapeTemplate(String s) {
        return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${");
    }

    static String escapeJsonString(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
