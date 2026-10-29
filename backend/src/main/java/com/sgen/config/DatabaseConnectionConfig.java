package com.sgen.config;

import com.sgen.service.DatabaseSettingsService;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
public class DatabaseConnectionConfig {

    @Bean
    public DataSource dataSource(DatabaseSettingsService settingsService) {
        DatabaseSettingsService.ConnectionSettings settings = settingsService.loadForStartup();
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(settings.jdbcUrl());
        dataSource.setUsername(settings.username());
        dataSource.setPassword(settings.password());
        dataSource.setDriverClassName("com.mysql.cj.jdbc.Driver");
        dataSource.setPoolName("sgen-mysql");
        dataSource.setMaximumPoolSize(10);
        dataSource.setMinimumIdle(settings.bootstrapMode() ? 0 : 2);
        dataSource.setConnectionTimeout(10000);
        dataSource.setInitializationFailTimeout(-1);
        return dataSource;
    }

    @Bean
    public HibernatePropertiesCustomizer databaseHibernateProperties(DatabaseSettingsService settingsService) {
        return properties -> {
            properties.put("hibernate.dialect", "org.hibernate.dialect.MySQLDialect");
            properties.put("hibernate.hbm2ddl.auto", settingsService.isBootstrapMode() ? "none" : "update");
            properties.put("hibernate.boot.allow_jdbc_metadata_access", !settingsService.isBootstrapMode());
        };
    }
}
