/* checks the domain matches what is in CONFIG.web.hostname & web.protocol and if not then redirects them */

var CONFIG = require('config');
var macfromip = require('../macfromip/macfromip');

var lastRequest = {};
var macActive = {};
exports = module.exports = {
    /**
     * If not on the domain and protocol (secure) in the config then redirect
     * this ensures auth cookies are set on the correct domain
     * because nodejitsu routes based on domain may need to add specific redirects for specific redirects
     * for specific domains
     */
    autoRedirect : function (req, res, next) {

        //express newbie, not sure why hostname, port and protocol are missing, [1] = host [2] = port:
        var hostPort = /([^:]*)(.*)/.exec(req.headers.host ),
            message,
            url,
            loginPage = CONFIG.web[ req.platform ] ?  CONFIG.web[ req.platform ].loginPage : '';
        // iOS captive portal
        if ( hostPort[1] !== CONFIG.web.hostname && req.useragent.isCaptive ) {
            console.log( 'debug1', hostPort[1], CONFIG.web.hostname );
            if ( loginPage ) {
                url = 'http://' + CONFIG.web.hostname + ( hostPort[2] ? hostPort[2] : '');
            } else {
                res.send( 'success' );
                res.end();
                message = 'return success for CaptiveRequest';
                console.log( message );
            }
            // android active portal
        } else if ( req.path === '/generate_204' && req.cookies.state ) {
            res.status( 204 ).send( 'success');
            res.end();
        // redirect to login page if no cookie
        } else  if ( !req.cookies.state &&
            loginPage &&
            req.path !== loginPage &&
            req.originalUrl !== CONFIG.web.hostname  + ( hostPort[2] ? hostPort[2] : '') + loginPage ) {
            console.log('debug2',hostPort[1] , req.originalUrl ,CONFIG.web.hostname  + ( hostPort[2] ? hostPort[2] : '') + loginPage );
            url = 'http://' + CONFIG.web.hostname  + ( hostPort[2] ? hostPort[2] : '') + loginPage ;
        }
        if ( url ) {
            res.header('Location', url);
            res.status(302);
            res.end();
            message = 'redirecting ' + req.headers.host + req.originalUrl + ' to ' + url;
            console.log(message);
        }
        return next(message);
    },
    log : function (req, res, next) {

        var clientIP = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            ( req.connection.socket ? req.connection.socket.remoteAddress : '') ||
            'IP lookup error',
            isHostIp = /^(\d+)\.(\d+).(\d+).(\d+)/.exec(req.headers.host) ? true : false,
            hostPort = /([^:]*)(.*)/.exec(req.headers.host ),
            isHostApp = (hostPort[1] !== CONFIG.web.hostname),
            lastRequestTime = lastRequest[clientIP] ? new Date().getTime() - lastRequest[clientIP] : 0,
            stateCookie = req.cookies? req.cookies.state : false;
        // add captivePortal flag
        req.useragent.isCaptive = /CaptiveNetworkSupport/.test( req.useragent.source );
        //console.log( 'domain middleware' ,isHostApp, req.headers.host , req.originalUrl, hostPort, clientIP,isHostIp);
        //console.log( 'user agent' , req.useragent.isCaptive);
        //console.log( 'lastrequest' , lastRequestTime );
        req.platform = req.useragent.OS.toLowerCase().replace(/ /g, '');
        console.log( req.platform, req.useragent.isCaptive,  lastRequestTime, req.originalUrl, clientIP, isHostIp, stateCookie, req.useragent.OS, req.useragent.Browser, req.useragent.isMobile, req.useragent.isTablet ,req.mac);

        lastRequest[clientIP] = new Date().getTime();
        req.isHostIp = isHostIp;
        req.isAppHost = isHostIp;
        res.cookie('state',req.originalUrl, { maxAge: 24*60*60, httpOnly: false });
        return next();

    },
    checkMac: function ( req,res,next ) {

        var clientIP = req.headers['x-forwarded-for'] ||
                req.connection.remoteAddress ||
                req.socket.remoteAddress ||
                ( req.connection.socket ? req.connection.socket.remoteAddress : '') ||
                'IP lookup error';

        // could carry distribute a database of known macs as well as messages etc. Trying to prevent continuous captive portal requests
        // and failure to reconnect due to network still requiring authentication
        macfromip.getMac(clientIP, function( mac ){
            // this will not work on local machine must connect over network
            req.mac = mac;
            if ( !req.state && macActive [ req.mac ] ) {
                req.state = 'known mac';
            }
            macActive [ req.mac ] = new Date().getTime();
            next();
            },
            function (err) {
                console.log( err );
                next();
        });
    }
    // if isCaptive and not "logged in" then return redirect to /login.html
    // else return 200 with "success"
};
