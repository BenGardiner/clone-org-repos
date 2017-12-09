var spawn = require('child_process').spawn
    , cli = require('cli').enable('help', 'status', 'version')
    , request = require('request').defaults({ jar: true })
    , path = require('path')
    , url_lib = require('url');

var github = exports;

function Organization(options) {
    this.BASE_URI = 'https://api.github.com/users/';
    this.currentPage = 1;
    this.organization = options.organization;
    this.perpage = parseInt(options.perpage);
    this.username = options.username;
    this.password = options.password;
    this.token = options.token;
    this.regexp = options.regexp;
    this.gitaccess = options.gitaccess;

    if (options.gitsettings) {
        this.gitsettings = options.gitsettings.split(' ');
    }

    if (options.only && options.regexp) {
        this.only = new RegExp(options.only);
    } else if (options.only) {
        this.only = options.only.split(',');
    }

    if (options.exclude && options.regexp) {
        this.exclude = new RegExp(options.exclude);
    } else if (options.exclude) {
        this.exclude = options.exclude.split(',');
    }

    this.type = options.type;
    this.nextPageUrl = this.getRequestUri();
}

Organization.prototype.getRequestUri = function() {
    return this.BASE_URI + this.organization + '/starred' + '?per_page=' + this.perpage + '&type=' + this.type;
}

Organization.prototype.getLastPage = function() {
    return this.lastPage || 1;
}

Organization.prototype.getRepositories = function(callback) {
    var options = {
        url: this.nextPageUrl,
        headers: {
            'User-Agent': 'request'
        },
        json: true
    };

    if (this.token) {
        options.headers['Authorization'] = 'token ' + this.token;
    } else {
        options['auth'] = {
          'user': this.username,
          'pass': this.password,
          'sendImmediately': true
        };
    }

    cli.info('Requesting github repositories for ' + this.organization + ' with url ' + options.url + ' ...');

    request.get(options, function (error, response, body) {

        if (error) {
            cli.error(error);
            callback.call(this, error);
        } else {
            cli.debug('current page ' + this.currentPage);
            this.parseLinks(response);
            this.currentPage++;
            cli.debug('next page ' + this.nextPageUrl);
            cli.debug('last page ' + this.getLastPage());

            for (var i = 0; i < body.length; i++) {
                this.clone(body[i]);
            }

            callback.call(this, null, { sucess: true });
        }
    }.bind(this));
}

Organization.prototype.parseLinks = function(response) {
    if (response.headers.link) {
        var paginationLinks = {};
        var links = response.headers.link.split(',')

        for (var i = 0; i < links.length; i++) {
            var section = links[i].split(';');
            var url = section[0].replace(/<(.*)>/, '$1').trim();
            var name = section[1].replace(/rel="(.*)"/, '$1').trim();

            if (name == 'last') {
                var lastPage = section[0].match(/&page=(.*)/)[1].replace('>', '');
                this.lastPage = parseInt(lastPage);
            }
            paginationLinks[name] = url;
        }

        this.nextPageUrl = paginationLinks['next'];
        cli.debug('nextPageUrl ' + this.nextPageUrl);
    }
}

Organization.prototype.clone = function(repo) {
    if (this.exclude && this.regexp && repo.name.match(this.exclude)) {
        return cli.debug('Repository ' + repo.name + ' ignored, exclude option: ' + this.exclude);
    } else if (this.exclude && !this.regexp && this.exclude.indexOf(repo.name) != -1) {
        return cli.debug('Repository ' + repo.name + ' ignored, exclude option: ' + this.exclude);
    } else if (this.only && this.regexp && !repo.name.match(this.only)) {
        cli.debug('Repository ' + repo.name + ' ignored, only option: ' + this.only);
    } else if (this.only && !this.regexp && this.only.indexOf(repo.name) == -1) {
        return cli.debug('Repository ' + repo.name + ' ignored, only option: ' + this.only);
    } else {
        this.executeCloneCommand(repo);
    }
}

Organization.prototype.getCloneUrl = function(repo) {
    var url;
    switch (this.gitaccess) {
        case 'ssh':
            url = repo.ssh_url;
            break;
        case 'git':
            url = repo.git_url;
            break;
        case 'https':
            url = repo.clone_url;
            break;
        default:
            return cli.error ( 'Unknown git access protocol provided: ' + this.gitaccess );
    }

    return url;
}

Organization.prototype.executeCloneCommand = function(repo) {
    var url = this.getCloneUrl(repo);

    var spawnParams = ['clone'].concat(this.gitsettings || [], url);
    cli.debug('cloning (or force-updating) ' + url);

    var process = spawn('git', spawnParams);

    process.on('close', function(status) {
        if (status == 0) {
            cli.debug('success cloning ' + url);
        } else {
            if (status != 128) {
                cli.error('git clone failed with status ' + status + ' with ' + spawnParams);
            } else {
                clone_dir = path.basename(url, '.git');
                spawnParams = ['-C', clone_dir, 'fetch'].concat(this.gitsettings || []);
                var process = spawn('git', spawnParams);

                process.on('close', function(status) {
                    if (status == 0) {
                        spawnParams = ['-C', clone_dir, 'reset', '--hard', 'origin/master'].concat(this.gitsettings || []);
                        var process = spawn('git', spawnParams);

                        process.on('close', function(status) {
                            if (status == 0) {
                                cli.debug('success fetch-resetting ' + url);
                            } else {
                                cli.error('git reset failed with status ' + status + ' with ' + spawnParams);
                            }
                        });
                    } else {
                        cli.error('git fetch failed with status ' + status + ' with ' + spawnParams);
                    }
                });
            }
        }
    });
}

module.exports = github;
github.Organization = Organization;
