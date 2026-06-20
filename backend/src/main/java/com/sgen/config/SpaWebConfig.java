package com.sgen.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Configuration to support Single Page Application (SPA) deep linking.
 * This allows refreshing any route (e.g., /monitoring) and having the
 * server return index.html so React Router can handle the route.
 */
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
            .addResourceLocations("classpath:/static/")
            .resourceChain(true)
            .addResolver(new SpaPageResourceResolver());
    }

    /**
     * Custom resource resolver that returns index.html for non-file requests.
     * This enables SPA routing to work on page refresh.
     */
    private static class SpaPageResourceResolver extends PathResourceResolver {
        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            Resource resource = location.createRelative(resourcePath);
            
            // If the requested resource exists and is readable, return it
            if (resource.exists() && resource.isReadable()) {
                return resource;
            }
            
            // For API requests, don't return index.html
            if (resourcePath.startsWith("api/") || resourcePath.startsWith("h2-console")) {
                return null;
            }
            
            // For all other requests, return index.html (SPA fallback)
            return new ClassPathResource("/static/index.html");
        }
    }
}
