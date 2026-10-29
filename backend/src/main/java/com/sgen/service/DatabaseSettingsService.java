package com.sgen.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;

@Service
@Slf4j
public class DatabaseSettingsService {
    public static final String DEFAULT_DATABASE_NAME = "eskimos_sgen_db";
    private static final String JDBC_OPTIONS = "?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC&connectTimeout=5000&socketTimeout=10000";
    private static final List<String> REQUIRED_TABLES = List.of(
            "ai_usage_log", "app_settings", "bikefit_analysis", "bikefit_settings",
            "calendar_events", "ftp_results", "gear_maintenance", "openai_config", "users",
            "user_achievements", "user_versions", "vo2max_results", "weather_forecasts",
            "weather_locations", "workout_shares"
    );
    private final Path configPath;
    private final boolean bootstrapMode;

    public DatabaseSettingsService() {
        String configuredPath = System.getenv("SGEN_DB_CONFIG_FILE");
        this.configPath = Path.of(configuredPath == null || configuredPath.isBlank()
                ? "./config/database.properties" : configuredPath).toAbsolutePath().normalize();
        this.bootstrapMode = !Files.isRegularFile(configPath) && !hasDatabaseEnvironment();
    }

    public ConnectionSettings loadForStartup() {
        if (bootstrapMode) {
            return new ConnectionSettings("127.0.0.1", 3306, DEFAULT_DATABASE_NAME, "sgen_unconfigured", "", true);
        }
        ConnectionSettings settings = readSavedSettings();
        if (settings == null) {
            String host = System.getenv("SGEN_DB_HOST");
            String username = System.getenv("SGEN_DB_USERNAME");
            String password = System.getenv("SGEN_DB_PASSWORD");
            String port = System.getenv().getOrDefault("SGEN_DB_PORT", "3306");
            String databaseName = System.getenv().getOrDefault("SGEN_DB_NAME", DEFAULT_DATABASE_NAME);
            if (host != null && !host.isBlank() && username != null && !username.isBlank() && password != null) {
                settings = new ConnectionSettings(host, Integer.parseInt(port), databaseName, username, password, false);
            }
        }
        if (settings == null) {
            throw new IllegalStateException("MySQL is not configured. Set SGEN_DB_HOST, SGEN_DB_PORT, "
                    + "SGEN_DB_NAME, SGEN_DB_USERNAME and SGEN_DB_PASSWORD, or configure " + configPath);
        }
        validate(settings.host(), settings.port(), settings.databaseName(), settings.username(), settings.password());
        return settings;
    }

    public boolean isBootstrapMode() {
        return bootstrapMode;
    }

    public SettingsView getSettings() {
        ConnectionSettings saved = readSavedSettings();
        if (saved != null) {
            return new SettingsView(saved.host(), saved.port(), saved.databaseName(), saved.username(), true, "file");
        }
        String host = System.getenv("SGEN_DB_HOST");
        String username = System.getenv("SGEN_DB_USERNAME");
        String password = System.getenv("SGEN_DB_PASSWORD");
        if (host != null && username != null && password != null) {
            int port = Integer.parseInt(System.getenv().getOrDefault("SGEN_DB_PORT", "3306"));
            String databaseName = System.getenv().getOrDefault("SGEN_DB_NAME", DEFAULT_DATABASE_NAME);
            return new SettingsView(host, port, databaseName, username, true, "environment");
        }
        return new SettingsView("", 3306, DEFAULT_DATABASE_NAME, "", false, bootstrapMode ? "bootstrap" : "none");
    }

    private static boolean hasDatabaseEnvironment() {
        String host = System.getenv("SGEN_DB_HOST");
        String username = System.getenv("SGEN_DB_USERNAME");
        String password = System.getenv("SGEN_DB_PASSWORD");
        return host != null && !host.isBlank() && username != null && !username.isBlank() && password != null;
    }

    public ConnectionTestResult testAndDescribe(String host, int port, String databaseName, String username, String password) {
        validate(host, port, databaseName, username, password);
        String jdbcUrl = jdbcUrl(host, port);
        try (Connection serverConnection = DriverManager.getConnection(jdbcUrl, username, password)) {
            boolean databaseExists = false;
            try (ResultSet catalogs = serverConnection.getMetaData().getCatalogs()) {
                while (catalogs.next()) {
                    if (databaseName.equalsIgnoreCase(catalogs.getString(1))) {
                        databaseExists = true;
                        break;
                    }
                }
            }
            if (!databaseExists) {
                return new ConnectionTestResult(true, false, false, 0, REQUIRED_TABLES,
                        "MySQL svarar och inloggningen fungerar, men databasen " + databaseName + " kunde inte hittas eller är inte synlig för användaren.");
            }

            Set<String> foundTables = new HashSet<>();
            try (Connection databaseConnection = DriverManager.getConnection(jdbcUrl(host, port, databaseName), username, password);
                 ResultSet tables = databaseConnection.getMetaData().getTables(databaseName, null, "%", new String[]{"TABLE"})) {
                while (tables.next()) {
                    foundTables.add(tables.getString("TABLE_NAME").toLowerCase(Locale.ROOT));
                }
            }
            List<String> missingTables = REQUIRED_TABLES.stream().filter(table -> !foundTables.contains(table)).toList();
            String message = missingTables.isEmpty()
                    ? "Anslutningen fungerar. Databasen finns och alla 15 SGEN-tabeller hittades."
                    : "Anslutningen fungerar. Databasen finns; " + missingTables.size()
                    + " tabeller saknas och skapas av Hibernate när tjänsten startas om.";
        return new ConnectionTestResult(true, true, true, foundTables.size(), missingTables, message);
        } catch (SQLException exception) {
            String message = safeConnectionError(exception);
            return new ConnectionTestResult(false, false, false, 0, REQUIRED_TABLES, message);
        }
    }

    public SettingsView save(String host, int port, String databaseName, String username, String password) {
        validate(host, port, databaseName, username, password);
        Properties properties = new Properties();
        properties.setProperty("host", host.trim());
        properties.setProperty("port", Integer.toString(port));
        properties.setProperty("databaseName", databaseName.trim());
        properties.setProperty("username", username.trim());
        properties.setProperty("password", password);
        try {
            Path parent = configPath.getParent();
            if (parent != null) Files.createDirectories(parent);
            Path temporaryPath = Files.createTempFile(parent, ".sgen-database-", ".tmp");
            try {
                try {
                    Files.setPosixFilePermissions(temporaryPath, Set.of(
                            PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
                } catch (UnsupportedOperationException ignored) {
                    // POSIX permissions are not available on every platform.
                }
                try (OutputStream output = Files.newOutputStream(temporaryPath)) {
                    properties.store(output, "SGEN MySQL connection settings. Keep this file private.");
                }
                try {
                    Files.move(temporaryPath, configPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException atomicMoveException) {
                    Files.move(temporaryPath, configPath, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temporaryPath);
            }
            return new SettingsView(host.trim(), port, databaseName.trim(), username.trim(), true, "file");
        } catch (IOException exception) {
            log.error("Could not save MySQL configuration to {}", configPath, exception);
            throw new IllegalStateException("Kunde inte spara databasinställningarna till den lokala konfigurationsfilen.");
        }
    }

    private ConnectionSettings readSavedSettings() {
        if (!Files.isRegularFile(configPath)) return null;
        Properties properties = new Properties();
        try (InputStream input = Files.newInputStream(configPath)) {
            properties.load(input);
            return new ConnectionSettings(properties.getProperty("host", ""),
                    Integer.parseInt(properties.getProperty("port", "3306")),
                    properties.getProperty("databaseName", DEFAULT_DATABASE_NAME),
                    properties.getProperty("username", ""), properties.getProperty("password", ""), false);
        } catch (IOException | NumberFormatException exception) {
            throw new IllegalStateException("Kunde inte läsa MySQL-konfigurationen från " + configPath, exception);
        }
    }

    private static void validate(String host, int port, String databaseName, String username, String password) {
        if (host == null || host.isBlank() || host.contains("/") || host.contains("?") || host.contains("#")) {
            throw new IllegalArgumentException("Ange en giltig IP-adress eller värd för MySQL.");
        }
        if (port < 1 || port > 65535) throw new IllegalArgumentException("Porten måste vara mellan 1 och 65535.");
        if (databaseName == null || !databaseName.matches("[A-Za-z0-9_]{1,64}")) {
            throw new IllegalArgumentException("Databasnamnet får bara innehålla bokstäver, siffror och understreck (max 64 tecken).");
        }
        if (username == null || username.isBlank()) throw new IllegalArgumentException("Ange ett MySQL-användarnamn.");
        if (password == null || password.isEmpty()) throw new IllegalArgumentException("Ange MySQL-lösenordet.");
    }

    private static String jdbcUrl(String host, int port) {
        return "jdbc:mysql://" + host.trim() + ":" + port + "/" + JDBC_OPTIONS + "&allowPublicKeyRetrieval=true";
    }

    private static String jdbcUrl(String host, int port, String database) {
        return "jdbc:mysql://" + host.trim() + ":" + port + "/" + database + JDBC_OPTIONS;
    }

    private static String safeConnectionError(SQLException exception) {
        String message = exception.getMessage() == null ? "" : exception.getMessage().toLowerCase(Locale.ROOT);
        if (exception.getErrorCode() == 1045 || message.contains("access denied")) {
            return "MySQL nås, men användarnamn eller lösenord godkändes inte.";
        }
        if (exception.getErrorCode() == 1049 || message.contains("unknown database")) {
            return "MySQL nås och inloggningen fungerar, men den valda databasen finns inte.";
        }
        return "Kunde inte ansluta till MySQL. Kontrollera IP-adress, port, serverstatus och nätverksregler.";
    }

    public record ConnectionSettings(String host, int port, String databaseName, String username, String password, boolean bootstrapMode) {
        public String jdbcUrl() {
            return DatabaseSettingsService.jdbcUrl(host, port, databaseName) + "&allowPublicKeyRetrieval=true";
        }
    }

    public record SettingsView(String host, int port, String databaseName, String username, boolean passwordConfigured, String source) { }

    public record ConnectionTestResult(boolean serverOnline, boolean databaseExists, boolean canConnectToDatabase,
                                       int tableCount, List<String> missingTables, String message) { }
}
