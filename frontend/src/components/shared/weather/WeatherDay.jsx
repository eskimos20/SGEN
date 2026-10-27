import { Cloud, CloudRain, Sun, Wind, Zap, CloudDrizzle, Snowflake, Eye, CloudSun, Sunrise, Sunset } from 'lucide-react';

const SYMBOL_ICONS = {
    1: <Sun className="h-7 w-7 text-yellow-500" />,
    2: <CloudSun className="h-7 w-7 text-yellow-400" />,
    3: <CloudSun className="h-6 w-6 text-yellow-300" />,
    4: <Cloud className="h-6 w-6 text-gray-400" />,
    5: <Cloud className="h-6 w-6 text-gray-500" />,
    6: <Cloud className="h-6 w-6 text-gray-600" />,
    7: <Eye className="h-6 w-6 text-gray-300" />,
    8: <CloudRain className="h-6 w-6 text-blue-400" />,
    9: <CloudRain className="h-6 w-6 text-blue-500" />,
    10: <CloudRain className="h-6 w-6 text-blue-700" />,
    11: <Zap className="h-6 w-6 text-purple-500" />,
    12: <CloudDrizzle className="h-6 w-6 text-cyan-400" />,
    13: <CloudDrizzle className="h-6 w-6 text-cyan-500" />,
    14: <CloudDrizzle className="h-6 w-6 text-cyan-600" />,
    15: <Snowflake className="h-6 w-6 text-blue-200" />,
    16: <Snowflake className="h-6 w-6 text-blue-300" />,
    17: <Snowflake className="h-6 w-6 text-blue-400" />,
    18: <CloudRain className="h-6 w-6 text-blue-400" />,
    19: <CloudRain className="h-6 w-6 text-blue-500" />,
    20: <CloudRain className="h-6 w-6 text-blue-700" />,
    21: <Zap className="h-6 w-6 text-purple-500" />,
    22: <CloudDrizzle className="h-6 w-6 text-cyan-400" />,
    23: <CloudDrizzle className="h-6 w-6 text-cyan-500" />,
    24: <CloudDrizzle className="h-6 w-6 text-cyan-600" />,
    25: <Snowflake className="h-6 w-6 text-blue-200" />,
    26: <Snowflake className="h-6 w-6 text-blue-300" />,
    27: <Snowflake className="h-6 w-6 text-blue-400" />,
};

const getIcon = (symbolCode) =>
    SYMBOL_ICONS[symbolCode] ?? <Cloud className="h-6 w-6 text-gray-400" />;

const formatDate = (dateString, isFirst) => {
    if (isFirst) return 'Today';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getWindDirection = (degrees) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
};

const getWindArrow = (degrees) => {
    const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
    const index = Math.round(degrees / 45) % 8;
    return arrows[index];
};

const formatSunTime = (time) => time?.slice(0, 5);

const WeatherDay = ({ day, isFirst }) => {
    const hasCurrentWind = isFirst && day.currentWindSpeed != null;
    const displayedWindSpeed = hasCurrentWind ? day.currentWindSpeed : day.windSpeed;
    const displayedWindDirection = hasCurrentWind && day.currentWindDirection != null
        ? day.currentWindDirection
        : day.windDirection;
    const displayedWindGust = hasCurrentWind ? day.currentWindGust : day.windGust;

    return (
        <div className="bg-gray-50 rounded-lg p-4 min-w-[140px] sm:min-w-0 flex-shrink-0">
            <div className="text-center mb-3">
                <div className="flex justify-center mb-2">
                    {getIcon(day.symbolCode)}
                </div>
                <div className="font-medium text-gray-900 text-sm">{formatDate(day.forecastDate, isFirst)}</div>
                <div className="text-xs text-gray-500 mt-1 truncate" title={day.weatherDescription}>
                    {day.weatherDescription}
                </div>
            </div>

            <div className="text-center">
                {isFirst && day.currentTemperature != null && (
                    <div className="text-xl font-bold text-gray-900 mb-1">
                        Now {Math.round(day.currentTemperature)}°
                    </div>
                )}
                <div className={`font-semibold text-gray-900 ${isFirst && day.currentTemperature != null ? 'text-sm' : 'text-lg'}`}>
                    {Math.round(day.temperatureMax)}° / {Math.round(day.temperatureMin)}°
                </div>
                <div className="flex flex-col items-center gap-1 text-xs text-gray-500 mt-2">
                    {(hasCurrentWind || displayedWindSpeed > 0) && (
                        <span className="flex items-center gap-1" title={hasCurrentWind ? "Current wind speed and gusts" : "Wind direction, speed, and gusts"}>
                            <Wind className="h-3 w-3" />
                            {hasCurrentWind && 'Now '}
                            {displayedWindDirection != null && `${getWindDirection(displayedWindDirection)} ${getWindArrow(displayedWindDirection)} `}
                            {Math.round(displayedWindSpeed)} m/s
                            {displayedWindGust > 0 && (hasCurrentWind
                                ? `, gusts ${Math.round(displayedWindGust)} m/s`
                                : displayedWindGust > displayedWindSpeed && ` (${Math.round(displayedWindGust)})`)}
                        </span>
                    )}
                    {(day.precipitationProbability > 0 || day.precipitationSum > 0 || day.precipitationMin > 0 || day.precipitationMax > 0) && (
                        <span className="flex items-center gap-1" title="Precipitation probability and amount">
                            <CloudRain className="h-3 w-3" />
                            {day.precipitationProbability > 0 && `${day.precipitationProbability}%`}
                            {day.precipitationProbability > 0 && (day.precipitationMin > 0 || day.precipitationMax > 0 || day.precipitationSum > 0) && ' '}
                            {day.precipitationMin != null && day.precipitationMax != null && day.precipitationMax > 0
                                ? `${day.precipitationMin} - ${day.precipitationMax} mm`
                                : day.precipitationSum > 0 && `${day.precipitationSum} mm`
                            }
                        </span>
                    )}
                    {day.cloudCover > 0 && (
                        <span className="flex items-center gap-1">
                            <Cloud className="h-3 w-3" />
                            {day.cloudCover * 12.5}%
                        </span>
                    )}
                    {day.sunrise && (
                        <span className="flex items-center gap-1" title="Sunrise">
                            <Sunrise className="h-3 w-3 text-orange-500" />
                            {formatSunTime(day.sunrise)}
                        </span>
                    )}
                    {day.sunset && (
                        <span className="flex items-center gap-1" title="Sunset">
                            <Sunset className="h-3 w-3 text-orange-600" />
                            {formatSunTime(day.sunset)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WeatherDay;
