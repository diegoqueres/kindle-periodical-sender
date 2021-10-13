const HttpStatus = require('../errors/http-status');
const APIError = require('../errors/api-error');
const { validationResult } = require('express-validator');
const UserService = require('../services/user-service');
const NewsletterService = require('../services/newsletter-service');
const Pagination = require('../libs/pagination');
const {userLogger} = require('../../config/logger');

class NewsletterController {
    static userService = new UserService();
    static newsletterService = new NewsletterService();

    async listAllFromLoggedUser(req, res) {
        req.query.loggedUser = true;
        return listAll(req, res);      
    }

    async listAll(req, res) {
        NewsletterController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await NewsletterController.getPermissions(req);

        const filter = Pagination.getFilter(req.query);
        if (permissionOnlyHimself || (req.query.loggedUser && req.query.loggedUser === true))
            filter.userId = loggedUser.id;
        if (req.query.name) 
            filter.name = req.query.name;

        const json = Pagination.getPagingData(
            await NewsletterController.newsletterService.findAll(filter), filter.page, filter.size
        );
        return res.json(json);
    }

    async findById(req, res) {
        NewsletterController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await NewsletterController.getPermissions(req);
        const requestedId = parseInt(req.params.id);

        const requestedNewsletter = await NewsletterController.newsletterService.findById(requestedId);
        if (requestedNewsletter == null) 
            throw new APIError('Not found', HttpStatus.NOT_FOUND, 'Newsletter not found');

        if (permissionOnlyHimself && requestedNewsletter.userId !== loggedUser.id)
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You cannot access newsletter from another user');

        res.json(requestedNewsletter);
    }

    async create(req, res) {
        NewsletterController.validate(req, res);
        const newsletterDto = req.body;

        const {loggedUser, permissionOnlyHimself} = await NewsletterController.getPermissions(req);
        if (permissionOnlyHimself && loggedUser.id !== newsletterDto.userId) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You don\'t have privileges to create newsletters from another users');     

        const createdNewsletter = await NewsletterController.newsletterService.save(newsletterDto);
        res.status(HttpStatus.CREATED).json(createdNewsletter);
        NewsletterController.logActivity(createdNewsletter, 'was created', loggedUser);
    }

    async edit(req, res) {
        NewsletterController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await NewsletterController.getPermissions(req);
        const requestedId = parseInt(req.params.id);
        const newsletterDto = req.body;
        
        const requestedNewsletter = await NewsletterController.newsletterService.findById(requestedId);
        if (requestedNewsletter == null) 
            throw new APIError('Not found', HttpStatus.NOT_FOUND, 'Newsletter not found');
        
        if (permissionOnlyHimself && loggedUser.id !== requestedNewsletter.userId) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You don\'t have privileges to edit newsletters of another users');         
        
        if (permissionOnlyHimself && requestedNewsletter.userId !== newsletterDto.userId) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You don\'t have privileges to transfer newsletters to another users');     

        const editedNewsletter = await NewsletterController.newsletterService.edit(requestedNewsletter, newsletterDto);
        res.status(HttpStatus.OK).json(editedNewsletter);
        NewsletterController.logActivity(editedNewsletter, 'was edited', loggedUser);
    }

    async activate(req, res) {
        NewsletterController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await NewsletterController.getPermissions(req);
        const requestedId = parseInt(req.params.id);
        
        const requestedNewsletter = await NewsletterController.newsletterService.findById(requestedId);
        if (requestedNewsletter == null) 
            throw new APIError('Not found', HttpStatus.NOT_FOUND, 'Newsletter not found');
        
        if (permissionOnlyHimself && loggedUser.id !== requestedNewsletter.userId) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You don\'t have privileges to edit newsletters of another users');              

        NewsletterController.newsletterService.activate(requestedNewsletter)
            .then(() => {
                res.status(HttpStatus.OK).json({
                    message: 'Newsletter was activated successfully',
                    requestedNewsletter
                });
                NewsletterController.logActivity(requestedNewsletter, 'was activated', loggedUser);
            });
    }

    async deactivate(req, res) {
        NewsletterController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await NewsletterController.getPermissions(req);
        const requestedId = parseInt(req.params.id);
        
        const requestedNewsletter = await NewsletterController.newsletterService.findById(requestedId);
        if (requestedNewsletter == null) 
            throw new APIError('Not found', HttpStatus.NOT_FOUND, 'Newsletter not found');
        
        if (permissionOnlyHimself && loggedUser.id !== requestedNewsletter.userId) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You don\'t have privileges to edit newsletters of another users');              

        NewsletterController.newsletterService.deactivate(requestedNewsletter)
            .then(() => {
                res.status(HttpStatus.OK).json({
                    message: 'Newsletter was deactivated successfully',
                    requestedNewsletter
                });
                NewsletterController.logActivity(requestedNewsletter, 'was deactivated', loggedUser);
            });     
    }

    async remove(req, res) {
        NewsletterController.validate(req, res);
        const {loggedUser, permissionOnlyHimself} = await NewsletterController.getPermissions(req);
        const requestedId = parseInt(req.params.id);
        
        const requestedNewsletter = await NewsletterController.newsletterService.findById(requestedId);
        if (requestedNewsletter == null) 
            throw new APIError('Not found', HttpStatus.NOT_FOUND, 'Newsletter not found');
        
        if (permissionOnlyHimself && loggedUser.id !== requestedNewsletter.userId) 
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You don\'t have privileges to edit newsletters of another users');              

        NewsletterController.newsletterService.remove(requestedNewsletter)
            .then(() => {
                res.status(HttpStatus.NO_CONTENT).json();
                NewsletterController.logActivity(requestedNewsletter, 'was removed', loggedUser);
            });            
    }

    static async getPermissions(req, blockedByChangePassword = true) {
        const loggedUserId = req.userId; 
        const loggedUser = await NewsletterController.userService.findById(loggedUserId);
        if (loggedUser == null) 
            throw new APIError('Unauthorized', HttpStatus.UNAUTHORIZED, 'Logged user cannot be found!');

        if (blockedByChangePassword && loggedUser.pendingPassword)
            throw new APIError('Forbidden', HttpStatus.FORBIDDEN, 'You must change your password before proceeding with this operation.');

        const permissions = {
            loggedUser,
            permissionOnlyHimself: ((!loggedUser.super) || (loggedUser.super && loggedUser.pendingConfirm)),
            permissionSuper: (loggedUser.super && !loggedUser.pendingConfirm)
        };
        return permissions;
    }

    static validate(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) 
          return res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({errors: errors.array()});
    }

    static logActivity(entity, action, loggedUser) {
        const logMessage = `${entity.constructor.name} #${entity.id} "${entity.name}" ${action}.`;
        const meta = loggedUser ? {loggedUser: {id: loggedUser.id, name: loggedUser.name}} : null;
        userLogger.info(logMessage, meta);
    }
}

module.exports = NewsletterController;