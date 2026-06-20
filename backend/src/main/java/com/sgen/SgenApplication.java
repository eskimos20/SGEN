package com.sgen;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SgenApplication {

    public static void main(String[] args) {
        SpringApplication.run(SgenApplication.class, args);
    }
}
