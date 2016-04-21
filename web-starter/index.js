'use strict';
var generators = require('yeoman-generator'), 
  _ = require('lodash'),
  Promise = require('bluebird'),
  rp = require('request-promise'),
  semver = require('semver'),
  glob = Promise.promisify(require('glob'));

function doFoo() {
  
}

module.exports = generators.Base.extend({
  initializing : {
    platform : function() {
      // Set the platform
      this.options.parent.answers.platform = 'wordpress';
    }
  },
  prompting : function() {
    var done = this.async();
    var that = this;
    
    var config = _.extend({
      wp_cfm : false,
      wordpress_theme : '',
      wp_version : ''
    }, this.config.getAll());
    
    rp({ 
      url : 'https://api.github.com/repos/WordPress/WordPress/tags',
      headers : {
        'User-Agent' : 'generator-web-starter-wordpress',
      }
    }).then(function(response) {
      var tags = _.chain(JSON.parse(response))
        .orderBy('name', 'desc')
        .map(function(tag) {
          var name = tag.name;
          
          if (!semver.valid(name)) {
            name = name + '.0';
          }
          
          tag.release = semver.major(name) + '.' + semver.minor(name);
          
          return tag;
        })
        .groupBy('release')
        .map(function(release) {
          return release.shift();
        })
        .map(function(tag) {
          return tag.name;
        })
        .value();
      
      // If we have an existing version ensure it's available in the list
      if (!_.isEmpty(config.wp_version) && !_.find(tags, config.wp_version)) {
        tags.push(config.wp_version);
        _.reverse(tags.sort());
      }
      else if (_.isEmpty(config.wp_version)) {
        config.wp_version = tags[0];
      }
      
      return new Promise(function(resolve, reject) {
        that.prompt([{
          type : 'list',
          name : 'wp_version',
          choices : tags,
          message : 'Select a version of WordPress',
          default : config.wp_version,
        },
        {
          type: 'confirm',
          name: 'wp_cfm',
          message: 'Does it use the WP-CFM plugin?',
          default: config.wp_cfm,
        },
        {
          type: 'input',
          name: 'wordpress_theme',
          message: 'Theme name (machine name)',
          default: config.wordpress_theme,
        },
        {
          type: 'confirm',
          name: 'install_wordpress',
          message: 'Install a fresh copy of WordPress?',
          default: false,
        }], function (answers) {
          resolve(answers);
        })
      });
    }).then(function(answers) {
      that.config.set(answers);

      // Expose the answers on the parent generator
      _.extend(that.options.parent.answers, { 'web-starter-wordpress' : answers });
    }).finally(function() {
      done();
    });
  },
  configuring : {
    addCapistrano : function() {
      var config = this.config.getAll();
      
      // If we're using Capistrano set some additional values
      if (_.has(this.options.parent.answers, 'web-starter-capistrano')) {
        _.extend(this.options.parent.answers['web-starter-capistrano'].config, {
          wordpress_wpcfm : config.wp_cfm,
          linked_dirs : '%w[public/wp-content/uploads public/wp-content/upgrade]'
        });
      }
    },
    setThemePath : function() {
      this.options.parent.answers.theme_path = 'public/wp-content/themes/' + this.options.parent.answers['web-starter-wordpress'].wordpress_theme;
    }
  },
  writing : {
    /**
     * Installs latest version
     */
    wordpress : function() {
      var that = this;
      var done = this.async();
      var config = this.config.getAll();

      if (config.install_wordpress) {
        // Create a Promise for remote downloading
        var remote = new Promise(function(resolve, reject) {
          that.remote('WordPress', 'WordPress', config.wp_version, function(err, remote) {
            if (err) {
              reject(err);
            }
            else {
              resolve(remote);
            }
          });
        });
        
        // Begin Promise chain
        remote.bind(this).then(function(remote) {
          this.remote = remote;
          return glob('**', { cwd : remote.cachePath });
        }).then(function(files) {
          var remote = this.remote;
          
          _.each(files, function(file) {
            that.fs.copy(
              remote.cachePath + '/' + file,
              that.destinationPath('public/' + file)
            );
          });
        }).finally(function() {
          // Declare we're done
          done();
        });
      }
      else {
        done();
      }  
    },
    
    settings : function() {
      var done = this.async();
      
      // Get current system config for this sub-generator
      var config = this.options.parent.answers['web-starter-wordpress'];
      _.extend(config, this.options.parent.answers);
      
      this.fs.copyTpl(
        this.templatePath('public/wp-config.vm.php'),
        this.destinationPath('public/wp-config.vm.php'),
        config
      );
      
      done();
    }
  }
});
